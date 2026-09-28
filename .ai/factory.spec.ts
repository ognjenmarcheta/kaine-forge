import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { workerArguments } from "./factory-docker";
import { FactoryStore } from "./factory-store";
import { applyFiles } from "./factory-workspace";
import {
  approval,
  factoryResultSchema,
  issueSnapshot,
  readiness,
  safeFile,
  validateChanges,
  validationCommands,
  verifyAcceptance,
  type FactoryResult
} from "./factory.util";

const temporary: string[] = [];
const directory = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kaine-factory-test-"));
  temporary.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const result = (files: FactoryResult["files"] = []): FactoryResult => ({
  issue: 1,
  revision: "a".repeat(40),
  status: "completed",
  summary: "Proposed fix",
  nextAction: "none",
  evidence: [],
  files,
  findings: []
});

describe("factory trust boundaries", () => {
  it.each([
    "../outside",
    "/outside",
    "C:/outside",
    "src\\outside",
    "src/../outside",
    ".git/config",
    ".GIT/config",
    ".github/workflows/release.yml",
    ".env",
    "src/.env.local",
    ".ai/factory.ts",
    ".AI/FACTORY.ts",
    ".ai/docker/factory.Dockerfile",
    "src/con.txt",
    "src/name.",
    "src/name ",
    "src/a\nfile"
  ])("rejects unsafe change %s", (file) => {
    expect(() => safeFile(file)).toThrow();
  });
  it("accepts a normal feature path", () => {
    expect(safeFile("apps/api/src/features/notes/notes.router.ts")).toBe(
      "apps/api/src/features/notes/notes.router.ts"
    );
  });
  it("does not allow a sibling with a matching prefix", () => {
    expect(() =>
      validateChanges(
        result([{ path: "packages/auth-extra/index.ts", content: "" }]),
        "implement",
        ["packages/auth"]
      )
    ).toThrow();
  });
  it("rejects duplicate paths on Windows", () => {
    expect(() =>
      validateChanges(
        result([
          { path: "src/a.ts", content: "one" },
          { path: "src/A.ts", content: "two" }
        ]),
        "implement",
        ["src"]
      )
    ).toThrow();
  });
  it("does not allow review or learning to edit", () => {
    for (const stage of ["review", "learn", "intake"] as const)
      expect(() =>
        validateChanges(result([{ path: "README.md", content: "" }]), stage, ["README.md"])
      ).toThrow();
  });
  it("specification can write only its own document", () => {
    expect(() =>
      validateChanges(result([{ path: "docs/specs/1.md", content: "spec" }]), "spec", [])
    ).not.toThrow();
    expect(() =>
      validateChanges(result([{ path: "docs/specs/2.md", content: "spec" }]), "spec", [])
    ).toThrow();
  });
  it("rejects malformed results and arbitrary commands", () => {
    expect(factoryResultSchema.safeParse({ ...result(), command: "git push" }).success).toBe(false);
    expect(factoryResultSchema.safeParse({ ...result(), status: "success" }).success).toBe(false);
  });
  it("applies a regular file and deletion", () => {
    const dir = directory();
    applyFiles(dir, result([{ path: "src/file.ts", content: "export const value = 1;\n" }]));
    expect(readFileSync(path.join(dir, "src/file.ts"), "utf8")).toContain("value = 1");
    applyFiles(dir, result([{ path: "src/file.ts", content: null }]));
  });
  it("rejects a junction before writing outside the checkout", () => {
    const dir = directory();
    const outside = directory();
    symlinkSync(outside, path.join(dir, "linked"), "junction");
    expect(() => applyFiles(dir, result([{ path: "linked/file.ts", content: "escape" }]))).toThrow(
      "Symlink"
    );
  });
  it("does not mount the host home or Docker socket", () => {
    const args = workerArguments(
      "sha256:image",
      randomUUID(),
      "socket-volume",
      "auth-volume",
      "codex",
      "propose"
    );
    expect(args).toContain("none");
    expect(args).toContain("--read-only");
    expect(args).toContain("type=volume,src=auth-volume,dst=/auth");
    expect(args.join(" ")).not.toContain("type=bind");
    expect(args.join(" ")).not.toContain("docker.sock");
    expect(args.join(" ")).not.toContain("--privileged");
  });
});

describe("readiness and acceptance", () => {
  const body =
    "## Outcome\nFix addition\n## Acceptance criteria\n- Returns the sum\n## Scope\n- src/add.ts\n## Validation\ncode\n## Evidence\nReproduction\n## Out of scope\nnone\n";
  it("parses all six fields", () => {
    expect(readiness(body)).toEqual({
      missing: [],
      scope: ["src/add.ts"],
      criteria: ["Returns the sum"],
      tier: "code"
    });
  });
  it("does not invent missing criteria or a validation tier", () => {
    expect(readiness("## Outcome\nFix addition").missing).toContain("acceptance criteria");
    expect(readiness(body.replace("\ncode\n", "\nmaybe\n")).tier).toBeNull();
  });
  const event = (id: number, actor = "owner", type = "labeled") => ({
    id,
    actor: { login: actor },
    event: type,
    created_at: "2026-09-28T00:00:00Z",
    label: { name: "ready-for-agent" }
  });
  it("accepts only the latest owner-applied readiness label", () => {
    expect(approval([event(1)], "owner")).toBe("1");
    expect(() => approval([event(1), event(2, "bot")], "owner")).toThrow();
    expect(() => approval([event(1), event(2, "owner", "unlabeled")], "owner")).toThrow();
  });
  it("changes the requirements fingerprint when requirements change", () => {
    const issue = {
      number: 1,
      title: "Fix",
      body,
      state: "open" as const,
      updated_at: "today",
      labels: [],
      user: { login: "owner" }
    };
    expect(issueSnapshot(issue, [])).not.toBe(
      issueSnapshot({ ...issue, body: body + "New requirement" }, [])
    );
  });
  it("blocks missing or failed acceptance evidence and blocking findings", () => {
    expect(() => verifyAcceptance(result(), ["sum"])).toThrow();
    const reviewed = {
      ...result(),
      evidence: [
        { criterion: "sum", status: "passed" as const, detail: "Independent sum tests passed" }
      ]
    };
    expect(() => verifyAcceptance(reviewed, ["sum"])).not.toThrow();
    expect(() =>
      verifyAcceptance(
        {
          ...reviewed,
          findings: [{ path: "src/add.ts", line: 1, body: "Wrong result", blocking: true }]
        },
        ["sum"]
      )
    ).toThrow();
  });
  it("raises validation for runtime and web changes", () => {
    expect(
      validationCommands("docs", ["apps/web/src/index.tsx"]).map((command) => command.join(" "))
    ).toEqual(expect.arrayContaining(["pnpm check", "pnpm build:core", "pnpm db:prepare:local"]));
    expect(() => validationCommands("native", [])).toThrow();
  });
});

describe("durable controller state", () => {
  it("prevents overlapping runs and preserves a lock across restarts", () => {
    const dir = directory();
    const first = new FactoryStore(dir);
    const id = randomUUID();
    const release = first.acquire(id);
    expect(() => new FactoryStore(dir).acquire(randomUUID())).toThrow();
    expect(new FactoryStore(dir).active()?.id).toBe(id);
    release();
    expect(first.active()).toBeNull();
  });
  it("persists cancellation without terminating arbitrary host processes", () => {
    const store = new FactoryStore(directory());
    const id = randomUUID();
    store.cancel(id);
    expect(new FactoryStore(store.directory).cancelled(id)).toBe(true);
    expect(() => store.cancel("../../outside")).toThrow();
  });
  it("keeps the last atomic record on a subsequent write", () => {
    const store = new FactoryStore(directory());
    store.write("record.json", { state: "running" });
    store.write("record.json", { state: "completed" });
    expect(JSON.parse(readFileSync(store.file("record.json"), "utf8"))).toEqual({
      state: "completed"
    });
  });
});
