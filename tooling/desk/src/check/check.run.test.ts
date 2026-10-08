import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deskConfigSchema } from "../contracts";
import { diffAgainstBase, type DiffResult } from "../git";
import type { Clock, Exec, ExecRequest } from "../ports";
import { checkReportSchema } from "./check.contract";
import { CHECK_REPORT_FILE, runChecks } from "./check.run";
import { createScratch, hermeticExec, type TestRepo, type TestScratch } from "../testing/git.repo";

vi.setConfig({ testTimeout: 30_000 });

interface Reply {
  readonly code?: number | null;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly timedOut?: boolean;
  /** Runs before the reply, so a "command" can change the worktree. */
  readonly effect?: () => Promise<void>;
}

/** Real git (for the diff hash), scripted everything else. */
const routed = (script: (request: ExecRequest) => Reply) => {
  const calls: ExecRequest[] = [];
  const exec: Exec = async (request) => {
    if (request.argv[0] === "git") return hermeticExec(request);
    calls.push(request);
    const reply = script(request);
    await reply.effect?.();
    return {
      code: reply.code === undefined ? 0 : reply.code,
      stdout: reply.stdout ?? "",
      stderr: reply.stderr ?? "",
      timedOut: reply.timedOut ?? false,
      truncated: false
    };
  };
  return { exec, calls };
};

const config = (loop: string[][] = [["pnpm", "check:affected"]], ship = [["pnpm", "check"]]) =>
  deskConfigSchema.parse({ checks: { loop, ship } });

let scratch: TestScratch;
let repo: TestRepo;
let base: string;
let artifacts: string;

beforeEach(async () => {
  scratch = await createScratch();
  repo = await scratch.repo("repo");
  base = await repo.git(["rev-parse", "HEAD"]);
  artifacts = path.join(scratch.root, "artifacts");
});

afterEach(async () => {
  await scratch.cleanup();
});

const run = (
  script: (request: ExecRequest) => Reply,
  over: Partial<Parameters<typeof runChecks>[0]> = {}
) => {
  const fake = routed(script);
  const report = runChecks({
    worktree: repo.dir,
    kind: "loop",
    config: config(),
    exec: fake.exec,
    baseSha: base,
    artifactsDir: artifacts,
    ...over
  });
  return { report, calls: fake.calls };
};

describe("runChecks", () => {
  it("passes when generate and every step exit 0, and writes the report", async () => {
    await repo.write("src/work.ts", "export const x = 1;\n");
    const { report, calls } = run(() => ({ stdout: "ok\n" }));
    const result = await report;
    expect(result.passed).toBe(true);
    expect(result.kind).toBe("loop");
    expect(result.fingerprint).toBeNull();
    expect(result.generatedDrift).toBe(false);
    expect(result.steps.map((step) => step.argv)).toEqual([
      ["pnpm", "generate"],
      ["pnpm", "check:affected"]
    ]);
    expect(calls.map((call) => call.cwd)).toEqual([repo.dir, repo.dir]);
    expect(result.diffHash).toBe((await diffAgainstBase(hermeticExec, repo.dir, base)).diffHash);

    const written: unknown = JSON.parse(
      await readFile(path.join(artifacts, CHECK_REPORT_FILE), "utf8")
    );
    expect(checkReportSchema.parse(written)).toEqual(result);
  });

  it("runs the ship steps for kind ship", async () => {
    const { report, calls } = run(() => ({}), { kind: "ship" });
    const result = await report;
    expect(result.kind).toBe("ship");
    expect(calls.map((call) => call.argv.join(" "))).toEqual(["pnpm generate", "pnpm check"]);
  });

  it("stops at the first failing step and reports its exit code and output", async () => {
    const { report, calls } = run(
      (request) =>
        request.argv[1] === "lint"
          ? { code: 2, stderr: "\u001b[31mERROR\u001b[0m: lint exploded\n" }
          : {},
      {
        config: config([
          ["pnpm", "typecheck"],
          ["pnpm", "lint"],
          ["pnpm", "test"]
        ])
      }
    );
    const result = await report;
    expect(result.passed).toBe(false);
    expect(result.steps.map((step) => [step.argv[1], step.code])).toEqual([
      ["generate", 0],
      ["typecheck", 0],
      ["lint", 2]
    ]);
    expect(result.steps[2]?.tail).toBe("ERROR: lint exploded");
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(calls.map((call) => call.argv[1])).not.toContain("test");
  });

  it("fails without running checks when generate itself fails", async () => {
    const { report, calls } = run((request) =>
      request.argv[1] === "generate" ? { code: 1, stderr: "codegen error: bad schema" } : {}
    );
    const result = await report;
    expect(result.passed).toBe(false);
    expect(result.generatedDrift).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("gives the same fingerprint to the same failure across rounds despite noise", async () => {
    let round = 0;
    const script = (request: ExecRequest): Reply => {
      if (request.argv[1] !== "check:affected") return {};
      round += 1;
      return {
        code: 1,
        stdout: [
          `[1${round}:0${round}:5${round}] cache miss, executing 4f3a9c0d1e2b77${round}${round}`,
          `FAIL src/a.test.ts > adds (${round * 37}ms)`,
          "AssertionError: expected 2 to be 3",
          ` ❯ ${repo.dir}/src/a.test.ts:${10 + round}:5`,
          `Duration ${round}.${round}s`
        ].join("\n")
      };
    };
    const first = await run(script).report;
    const second = await run(script).report;
    expect(first.fingerprint).not.toBeNull();
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it("gives different fingerprints to different failures", async () => {
    const failWith = (message: string) =>
      run((request) => (request.argv[1] === "check:affected" ? { code: 1, stdout: message } : {}))
        .report;
    const a = await failWith("AssertionError: expected 2 to be 3");
    const b = await failWith("error TS2322: Type 'string' is not assignable to type 'number'");
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("detects generated drift, fails the round and skips the checks", async () => {
    const generated = () => writeFile(path.join(repo.dir, "generated.graphql"), "type Query\n");
    const { report, calls } = run((request) =>
      request.argv[1] === "generate" ? { effect: generated } : {}
    );
    const result = await report;
    expect(result.generatedDrift).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.fingerprint).not.toBeNull();
    expect(calls.map((call) => call.argv[1])).toEqual(["generate"]);
    const drift = result.steps.at(-1);
    expect(drift?.code).toBe(1);
    expect(drift?.tail).toContain("generated.graphql");
  });

  it("does not call a no-op generate drift, even with uncommitted work in the tree", async () => {
    await repo.write("src/work.ts", "export const x = 1;\n");
    const result = await run(() => ({})).report;
    expect(result.generatedDrift).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("detects drift in a file that was already modified", async () => {
    await repo.write("README.md", "agent edit\n");
    const regenerate = () => writeFile(path.join(repo.dir, "README.md"), "generated edit\n");
    const result = await run((request) =>
      request.argv[1] === "generate" ? { effect: regenerate } : {}
    ).report;
    expect(result.generatedDrift).toBe(true);
    expect(result.steps.at(-1)?.tail).toContain("README.md");
  });

  it("gives the same fingerprint to the same drift", async () => {
    const drift = async () => {
      const result = await run((request) =>
        request.argv[1] === "generate"
          ? { effect: () => writeFile(path.join(repo.dir, "generated.txt"), "g\n") }
          : {}
      ).report;
      await repo.git(["clean", "-fdq"]);
      return result.fingerprint;
    };
    const first = await drift();
    expect(await drift()).toBe(first);
  });

  it("hashes the diff as it is after the checks ran", async () => {
    const untouched = (await diffAgainstBase(hermeticExec, repo.dir, base)).diffHash;
    const touch = () => writeFile(path.join(repo.dir, "formatted.txt"), "changed by a check\n");
    const result = await run((request) =>
      request.argv[1] === "check:affected" ? { effect: touch } : {}
    ).report;
    expect(result.diffHash).toBe((await diffAgainstBase(hermeticExec, repo.dir, base)).diffHash);
    expect(result.diffHash).not.toBe(untouched);
  });

  it("bounds the output tail in lines and characters", async () => {
    const lines = Array.from({ length: 5000 }, (_, index) => `line ${index}`).join("\n");
    const result = await run((request) =>
      request.argv[1] === "check:affected" ? { code: 1, stdout: lines } : {}
    ).report;
    const tail = result.steps.at(-1)?.tail ?? "";
    expect(tail.split("\n").length).toBeLessThanOrEqual(200);
    expect(tail.endsWith("line 4999")).toBe(true);
    expect(tail).not.toContain("line 100\n");

    const wide = await run((request) =>
      request.argv[1] === "check:affected" ? { code: 1, stdout: "y".repeat(100_000) } : {}
    ).report;
    expect((wide.steps.at(-1)?.tail ?? "").length).toBeLessThanOrEqual(16_003);
  });

  it("passes the configured timeouts to every step and marks a timeout", async () => {
    const { report, calls } = run(
      (request) => (request.argv[1] === "check:affected" ? { code: null, timedOut: true } : {}),
      { stepTimeoutMs: 5_000, generateTimeoutMs: 7_000 }
    );
    const result = await report;
    expect(calls.map((call) => call.timeoutMs)).toEqual([7_000, 5_000]);
    const step = result.steps.at(-1);
    expect(step).toMatchObject({ code: null, timedOut: true });
    expect(step?.tail).toContain("timed out after 5s");
    expect(result.passed).toBe(false);
  });

  it("gives timeouts of the same command one fingerprint", async () => {
    const timeout = () =>
      run((request) =>
        request.argv[1] === "check:affected"
          ? { code: null, timedOut: true, stdout: `partial ${Math.random()}` }
          : {}
      ).report;
    expect((await timeout()).fingerprint).toBe((await timeout()).fingerprint);
  });

  it("measures each step with the injected clock", async () => {
    let now = Date.parse("2026-10-07T10:00:00.000Z");
    const clock: Clock = { now: () => new Date((now += 100)) };
    const result = await run(() => ({}), { clock }).report;
    expect(result.steps.every((step) => step.durationMs === 100)).toBe(true);
    expect(Date.parse(result.finishedAt)).toBeGreaterThan(Date.parse(result.startedAt));
  });

  it("runs commands as argv with no color", async () => {
    const { report, calls } = run(() => ({}));
    await report;
    for (const call of calls) {
      expect(call.env).toMatchObject({ NO_COLOR: "1" });
      expect(call.argv[0]).toBe("pnpm");
    }
  });
});

describe("runChecks with an executor", () => {
  const diffOf = (hash: string, patch = ""): (() => Promise<DiffResult>) => {
    return () => Promise.resolve({ patch, files: [], diffHash: hash });
  };
  const scripted = (script: (request: ExecRequest) => Reply) => {
    const calls: ExecRequest[] = [];
    const exec: Exec = (request) => {
      calls.push(request);
      const reply = script(request);
      return Promise.resolve({
        code: reply.code === undefined ? 0 : reply.code,
        stdout: reply.stdout ?? "",
        stderr: reply.stderr ?? "",
        timedOut: reply.timedOut ?? false,
        truncated: false
      });
    };
    return { exec, calls };
  };
  const hostExec: Exec = () => Promise.reject(new Error("the host exec must not run"));

  it("runs every step and takes every diff through the executor, never through the host", async () => {
    const executor = scripted(() => ({ stdout: "ok\n" }));
    const hash = "a".repeat(64);
    const result = await runChecks({
      worktree: repo.dir,
      kind: "loop",
      config: config(),
      exec: hostExec,
      baseSha: base,
      artifactsDir: artifacts,
      executor: { exec: executor.exec, diff: diffOf(hash) }
    });
    expect(result.passed).toBe(true);
    expect(result.diffHash).toBe(hash);
    expect(executor.calls.map((call) => call.argv.join(" "))).toEqual([
      "pnpm generate",
      "pnpm check:affected"
    ]);
    // The report has the same fields and parses with the same schema.
    const written: unknown = JSON.parse(
      await readFile(path.join(artifacts, CHECK_REPORT_FILE), "utf8")
    );
    expect(checkReportSchema.parse(written)).toEqual(result);
  });

  it("detects generated drift from the executor's diff", async () => {
    const executor = scripted(() => ({}));
    const hashes = ["1".repeat(64), "2".repeat(64)];
    let reads = 0;
    const patches = ["diff --git a/x b/x\n+one\n", "diff --git a/x b/x\n+two\n"];
    const result = await runChecks({
      worktree: repo.dir,
      kind: "loop",
      config: config(),
      exec: hostExec,
      baseSha: base,
      artifactsDir: artifacts,
      executor: {
        exec: executor.exec,
        diff: () => {
          const index = Math.min(reads, 1);
          reads += 1;
          return Promise.resolve({
            patch: patches[index] ?? "",
            files: [],
            diffHash: hashes[index] ?? ""
          });
        }
      }
    });
    expect(result.passed).toBe(false);
    expect(result.generatedDrift).toBe(true);
    expect(result.steps.at(-1)?.tail).toContain("pnpm generate changed the tree");
    expect(result.steps.at(-1)?.tail).toContain("x");
    expect(executor.calls).toHaveLength(1);
  });

  it("uses the executor's roots, so a container path does not change the fingerprint", async () => {
    const failing = (root: string) =>
      runChecks({
        worktree: repo.dir,
        kind: "loop",
        config: config(),
        exec: hostExec,
        baseSha: base,
        artifactsDir: artifacts,
        executor: {
          exec: scripted((request) =>
            request.argv[1] === "check:affected"
              ? { code: 1, stderr: `error in ${root}/src/a.ts:3` }
              : {}
          ).exec,
          diff: diffOf("b".repeat(64)),
          roots: ["/workspace", "/tmp", "/home/desk"]
        }
      });
    const inContainer = await failing("/workspace");
    const elsewhere = await failing("/tmp");
    expect(inContainer.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(elsewhere.fingerprint).toBe(inContainer.fingerprint);
  });
});
