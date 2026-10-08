import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BootstrapInput } from "../engine/worktree.bootstrap";
import { createGitPort } from "../git";
import type { Exec, ExecRequest } from "../ports";
import { createWorktree, removeWorktree, type WorktreeDeps } from "./worktree.create";
import {
  createOriginAndClone,
  createScratch,
  hermeticExec,
  type TestRepo,
  type TestScratch
} from "../testing/git.repo";

vi.setConfig({ testTimeout: 30_000 });

const BRANCH = "KAINE-77-feat-export-reports";
const READY = JSON.stringify({ installation: "ready", problems: [] });

interface PnpmReply {
  readonly code?: number | null;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly timedOut?: boolean;
  readonly effect?: (request: ExecRequest) => Promise<void>;
}

/** Real git, scripted pnpm. Every call is recorded in order. */
const environment = (script: (request: ExecRequest) => PnpmReply = () => ({})) => {
  const calls: ExecRequest[] = [];
  const exec: Exec = async (request) => {
    calls.push(request);
    if (request.argv[0] === "git") return hermeticExec(request);
    const reply = script(request);
    await reply.effect?.(request);
    const doctor = request.argv[1] === "ai:doctor";
    return {
      code: reply.code === undefined ? 0 : reply.code,
      stdout: reply.stdout ?? (doctor ? READY : ""),
      stderr: reply.stderr ?? "",
      timedOut: reply.timedOut ?? false,
      truncated: false
    };
  };
  const deps: WorktreeDeps = { exec, git: createGitPort(exec) };
  return { calls, deps };
};

let scratch: TestScratch;
let clone: TestRepo;
let origin: TestRepo;
let input: BootstrapInput;

beforeEach(async () => {
  scratch = await createScratch();
  ({ clone, origin } = await createOriginAndClone(scratch));
  input = {
    issue: 77,
    type: "feat",
    slug: "export-reports",
    base: "main",
    worktreeDir: path.join(scratch.root, "wt"),
    agents: ["claude"],
    skills: ["kaine-write-plan"],
    mcp: ["serena"]
  };
});

afterEach(async () => {
  await scratch.cleanup();
});

/** Labels of the recipe commands, without the read-only git lookups around them. */
const ids = (calls: readonly ExecRequest[]): string[] =>
  calls
    .filter((call) => {
      const [tool, sub, third] = call.argv;
      if (tool !== "git") return true;
      if (sub === "show-ref") return false;
      return !(sub === "worktree" && (third === "prune" || third === "list"));
    })
    .map((call) => call.argv.slice(0, 2).join(" "));

describe("createWorktree", () => {
  it("runs the recipe in order, in the right directories, and returns the base", async () => {
    const { calls, deps } = environment();
    const originHead = await origin.git(["rev-parse", "main"]);
    const result = await createWorktree(deps, { repoDir: clone.dir, input });

    expect(result).toEqual({
      ok: true,
      worktreePath: input.worktreeDir,
      baseSha: originHead,
      branch: BRANCH,
      reused: false
    });
    expect(ids(calls)).toEqual([
      "git check-ref-format",
      "git fetch",
      "git worktree",
      "pnpm install",
      "pnpm env:ensure",
      "pnpm ai:install",
      "pnpm ai:doctor",
      "git status",
      "git rev-parse"
    ]);
    const byTool = (tool: string) => calls.filter((call) => call.argv[0] === tool);
    expect(byTool("pnpm").every((call) => call.cwd === input.worktreeDir)).toBe(true);
    expect(calls.find((call) => call.argv[1] === "fetch")?.cwd).toBe(clone.dir);
    expect(calls.every((call) => typeof call.timeoutMs === "number" && call.timeoutMs > 0)).toBe(
      true
    );
    expect(await clone.git(["rev-parse", "--abbrev-ref", "HEAD"], input.worktreeDir)).toBe(BRANCH);
  });

  it("never forces anything and never leaves the argv-only path", async () => {
    const { calls, deps } = environment();
    await createWorktree(deps, { repoDir: clone.dir, input });
    await createWorktree(deps, { repoDir: clone.dir, input });
    for (const call of calls) {
      expect(call.argv).not.toContain("--force");
      expect(call.argv).not.toContain("-f");
      expect(call.argv.join(" ")).not.toContain("--no-verify");
      expect(["git", "pnpm"]).toContain(call.argv[0]);
    }
  });

  it("is idempotent: a second call reuses the worktree and skips the git steps", async () => {
    const first = environment();
    const created = await createWorktree(first.deps, { repoDir: clone.dir, input });
    const second = environment();
    const again = await createWorktree(second.deps, { repoDir: clone.dir, input });

    expect(again).toMatchObject({
      ok: true,
      reused: true,
      baseSha: created.ok ? created.baseSha : ""
    });
    const pnpmIds = second.calls
      .filter((call) => call.argv[0] === "pnpm")
      .map((call) => call.argv[1]);
    expect(pnpmIds).toEqual(["install", "env:ensure", "ai:install", "ai:doctor"]);
    expect(second.calls.some((call) => call.argv[1] === "fetch")).toBe(false);
    expect(second.calls.some((call) => call.argv.includes("add"))).toBe(false);
  });

  it("keeps uncommitted work and later commits when it reuses a worktree", async () => {
    const first = environment();
    const created = await createWorktree(first.deps, { repoDir: clone.dir, input });
    if (!created.ok) throw new Error("setup failed");
    await writeFile(path.join(input.worktreeDir, "wip.txt"), "work in progress\n");
    await clone.git(["add", "wip.txt"], input.worktreeDir);
    await clone.git(["commit", "--quiet", "-m", "agent commit"], input.worktreeDir);
    await writeFile(path.join(input.worktreeDir, "more.txt"), "uncommitted\n");
    // The base branch moves on; the fork point must not.
    const seed = await scratch.repo("pusher");
    await seed.git(["remote", "add", "origin", origin.dir]);
    await seed.git(["fetch", "--quiet", "origin"]);
    await seed.git(["reset", "--quiet", "--hard", "origin/main"]);
    await seed.write("next.txt", "next");
    await seed.commit("main moves on");
    await seed.git(["push", "--quiet", "origin", "main"]);
    await clone.git(["fetch", "--quiet", "origin", "main"]);

    const again = await createWorktree(environment().deps, { repoDir: clone.dir, input });
    expect(again).toMatchObject({ ok: true, reused: true, baseSha: created.baseSha });
    expect(await readFile(path.join(input.worktreeDir, "more.txt"), "utf8")).toBe("uncommitted\n");
    expect(await clone.git(["log", "-1", "--format=%s"], input.worktreeDir)).toBe("agent commit");
  });

  it("checks out the kept branch again after the worktree was removed", async () => {
    const { deps } = environment();
    const created = await createWorktree(deps, { repoDir: clone.dir, input });
    if (!created.ok) throw new Error("setup failed");
    await writeFile(path.join(input.worktreeDir, "kept.txt"), "kept\n");
    await clone.git(["add", "kept.txt"], input.worktreeDir);
    await clone.git(["commit", "--quiet", "-m", "kept work"], input.worktreeDir);
    expect(
      await removeWorktree(deps, {
        repoDir: clone.dir,
        worktreePath: input.worktreeDir,
        force: false
      })
    ).toEqual({
      ok: true,
      removed: true
    });

    const again = await createWorktree(environment().deps, { repoDir: clone.dir, input });
    expect(again).toMatchObject({ ok: true, reused: false, baseSha: created.baseSha });
    expect(await readFile(path.join(input.worktreeDir, "kept.txt"), "utf8")).toBe("kept\n");
  });

  it("recovers when the directory was deleted by hand", async () => {
    const { deps } = environment();
    await createWorktree(deps, { repoDir: clone.dir, input });
    await rm(input.worktreeDir, { recursive: true, force: true });
    const again = await createWorktree(environment().deps, { repoDir: clone.dir, input });
    expect(again).toMatchObject({ ok: true, reused: false });
    expect((await stat(input.worktreeDir)).isDirectory()).toBe(true);
  });

  it("refuses a directory that is a worktree of another branch", async () => {
    await clone.git(["worktree", "add", "-b", "other-branch", input.worktreeDir, "origin/main"]);
    const { calls, deps } = environment();
    const result = await createWorktree(deps, { repoDir: clone.dir, input });
    expect(result).toMatchObject({ ok: false, step: "verify-existing" });
    expect(result.ok ? "" : result.reason).toContain("other-branch");
    expect(calls.some((call) => call.argv[0] === "pnpm")).toBe(false);
  });

  it("refuses a directory that is not a worktree", async () => {
    await mkdir(input.worktreeDir, { recursive: true });
    await writeFile(path.join(input.worktreeDir, "precious.txt"), "mine\n");
    const result = await createWorktree(environment().deps, { repoDir: clone.dir, input });
    expect(result).toMatchObject({ ok: false, step: "verify-existing", code: null });
    expect(await readFile(path.join(input.worktreeDir, "precious.txt"), "utf8")).toBe("mine\n");
  });

  it("refuses an existing branch that shares no history with the base", async () => {
    await clone.git(["checkout", "--quiet", "--orphan", BRANCH]);
    await clone.write("alien.txt", "a");
    await clone.commit("unrelated history");
    await clone.git(["checkout", "--quiet", "main"]);
    const result = await createWorktree(environment().deps, { repoDir: clone.dir, input });
    expect(result).toMatchObject({ ok: false, step: "verify-base" });
  });

  it("stops at the failing step with its exit code and output tail", async () => {
    const { calls, deps } = environment((request) =>
      request.argv[1] === "install"
        ? { code: 1, stderr: "\u001b[31mERR_PNPM_OUTDATED_LOCKFILE\u001b[0m lockfile needs update" }
        : {}
    );
    const result = await createWorktree(deps, { repoDir: clone.dir, input });
    expect(result).toEqual({
      ok: false,
      step: "install",
      code: 1,
      reason: "install exited with 1",
      tail: "ERR_PNPM_OUTDATED_LOCKFILE lockfile needs update"
    });
    expect(calls.map((call) => call.argv[1])).not.toContain("env:ensure");
  });

  it("keeps the half-built worktree so a retry reuses it", async () => {
    const failing = environment((request) => (request.argv[1] === "install" ? { code: 1 } : {}));
    await createWorktree(failing.deps, { repoDir: clone.dir, input });
    const retry = await createWorktree(environment().deps, { repoDir: clone.dir, input });
    expect(retry).toMatchObject({ ok: true, reused: true });
  });

  it("reports a timeout as a failure without an exit code", async () => {
    const { deps } = environment((request) =>
      request.argv[1] === "env:ensure" ? { code: null, timedOut: true } : {}
    );
    const result = await createWorktree(deps, { repoDir: clone.dir, input });
    expect(result).toMatchObject({ ok: false, step: "env-ensure", code: null });
    expect(result.ok ? "" : result.reason).toContain("timed out");
  });

  it("fails when the AI doctor does not report a ready installation", async () => {
    const { deps } = environment((request) =>
      request.argv[1] === "ai:doctor"
        ? { stdout: JSON.stringify({ installation: "needs-attention" }) }
        : {}
    );
    const result = await createWorktree(deps, { repoDir: clone.dir, input });
    expect(result).toMatchObject({ ok: false, step: "ai-doctor-claude" });
    expect(result.ok ? "" : result.reason).toContain("needs-attention");
  });

  it("fails the baseline when setup leaves the tree dirty", async () => {
    const { deps } = environment((request) =>
      request.argv[1] === "install"
        ? { effect: (r) => writeFile(path.join(r.cwd ?? "", "pnpm-lock.yaml"), "changed\n") }
        : {}
    );
    const result = await createWorktree(deps, { repoDir: clone.dir, input });
    expect(result).toMatchObject({ ok: false, step: "baseline-status" });
  });

  it("uses per-step timeout overrides", async () => {
    const { calls, deps } = environment();
    await createWorktree(
      { ...deps, timeoutsMs: { install: 1234, "ai-doctor": 4321 } },
      { repoDir: clone.dir, input }
    );
    expect(calls.find((call) => call.argv[1] === "install")?.timeoutMs).toBe(1234);
    expect(calls.find((call) => call.argv[1] === "ai:doctor")?.timeoutMs).toBe(4321);
    expect(calls.find((call) => call.argv[1] === "env:ensure")?.timeoutMs).toBeGreaterThan(1234);
  });

  it("throws on input that would build an invalid plan", async () => {
    await expect(
      createWorktree(environment().deps, {
        repoDir: clone.dir,
        input: { ...input, base: "--upload-pack=x" }
      })
    ).rejects.toThrow(RangeError);
  });
});

describe("removeWorktree", () => {
  const created = async () => {
    const { deps } = environment();
    const result = await createWorktree(deps, { repoDir: clone.dir, input });
    if (!result.ok) throw new Error("setup failed");
    return deps;
  };
  const exists = async (target: string) =>
    stat(target).then(
      () => true,
      () => false
    );

  it("removes a clean worktree and keeps the branch", async () => {
    const deps = await created();
    const result = await removeWorktree(deps, {
      repoDir: clone.dir,
      worktreePath: input.worktreeDir,
      force: false
    });
    expect(result).toEqual({ ok: true, removed: true });
    expect(await exists(input.worktreeDir)).toBe(false);
    expect(await deps.git.branchExists(clone.dir, BRANCH)).toBe(true);
  });

  it("removes a worktree that only holds ignored files", async () => {
    await writeFile(path.join(clone.dir, ".git", "info", "exclude"), "node_modules/\n");
    const deps = await created();
    await mkdir(path.join(input.worktreeDir, "node_modules", "pkg"), { recursive: true });
    await writeFile(path.join(input.worktreeDir, "node_modules", "pkg", "index.js"), "x");
    expect(
      await removeWorktree(deps, {
        repoDir: clone.dir,
        worktreePath: input.worktreeDir,
        force: false
      })
    ).toEqual({ ok: true, removed: true });
    expect(await exists(input.worktreeDir)).toBe(false);
  });

  it.each([
    [
      "a modified tracked file",
      async () => writeFile(path.join(input.worktreeDir, "README.md"), "edit\n")
    ],
    ["an untracked file", async () => writeFile(path.join(input.worktreeDir, "new.txt"), "new\n")]
  ])("refuses %s unless forced, and force removes it", async (_name, dirty) => {
    const deps = await created();
    await dirty();
    const refused = await removeWorktree(deps, {
      repoDir: clone.dir,
      worktreePath: input.worktreeDir,
      force: false
    });
    expect(refused).toMatchObject({ ok: false, reason: "dirty" });
    expect(await exists(input.worktreeDir)).toBe(true);

    expect(
      await removeWorktree(deps, {
        repoDir: clone.dir,
        worktreePath: input.worktreeDir,
        force: true
      })
    ).toEqual({ ok: true, removed: true });
    expect(await exists(input.worktreeDir)).toBe(false);
    expect(await deps.git.branchExists(clone.dir, BRANCH)).toBe(true);
  });

  it("refuses a directory that is not a worktree and deletes nothing", async () => {
    const { deps } = environment();
    const plain = path.join(scratch.root, "plain");
    await mkdir(plain);
    await writeFile(path.join(plain, "keep.txt"), "keep\n");
    const result = await removeWorktree(deps, {
      repoDir: clone.dir,
      worktreePath: plain,
      force: true
    });
    expect(result).toMatchObject({ ok: false, reason: "not-a-worktree" });
    expect(await exists(path.join(plain, "keep.txt"))).toBe(true);
  });

  it("never removes the main checkout", async () => {
    const { deps } = environment();
    const result = await removeWorktree(deps, {
      repoDir: clone.dir,
      worktreePath: clone.dir,
      force: true
    });
    expect(result).toMatchObject({ ok: false, reason: "not-a-worktree" });
    expect(await exists(path.join(clone.dir, ".git"))).toBe(true);
  });

  it("succeeds without removing anything when the worktree is already gone", async () => {
    const { deps } = environment();
    expect(
      await removeWorktree(deps, {
        repoDir: clone.dir,
        worktreePath: path.join(scratch.root, "never-existed"),
        force: false
      })
    ).toEqual({ ok: true, removed: false });
  });

  it("reports a git failure instead of throwing", async () => {
    const deps = await created();
    await clone.git(["worktree", "lock", input.worktreeDir]);
    const result = await removeWorktree(deps, {
      repoDir: clone.dir,
      worktreePath: input.worktreeDir,
      force: false
    });
    expect(result).toMatchObject({ ok: false, reason: "git-failed" });
    expect(await exists(input.worktreeDir)).toBe(true);
  });
});
