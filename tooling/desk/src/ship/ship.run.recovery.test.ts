import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, vi } from "vitest";

import { SHIP_RECORD_FILE, shipRecordSchema, type ShipResult } from "./ship.contract";
import { shipIssue } from "./ship.run";
import {
  expectSafeCalls,
  fileExists,
  filesInCommit,
  pnpmRuns,
  refusalKinds,
  shipTest,
  worktreeStatus,
  type ShipEnv
} from "./ship.testing";
import type { GitHubPort } from "../ports";
import { ISSUE } from "../testing/pipeline.testing";

// Real git, a local bare "origin", real hooks. Every git call is slow on a busy machine.
vi.setConfig({ testTimeout: 180_000 });

const SOURCE = { "tooling/desk/src/feature.ts": "export const feature = 1;\n" };
const RELEASABLE = {
  changeset: { required: true, packages: ["@repo/desk"], bump: "minor" as const }
};

const failureOf = (result: ShipResult) => {
  if (result.status !== "failed") {
    throw new Error(`expected a failed result, got ${JSON.stringify(result).slice(0, 800)}`);
  }
  return result.failure;
};

/** Everything a failed step before the commit must leave behind: a pristine tree. */
const expectRolledBack = async (env: ShipEnv): Promise<void> => {
  expect(await env.commitCount()).toBe(0);
  expect(await fileExists(path.join(env.worktree, ".changeset/export-reports.md"))).toBe(false);
  // The only change is the agent's own file, and nothing is staged.
  expect(await env.clone.git(["diff", "--cached", "--name-only"], env.worktree)).toBe("");
  expect(env.github.createdPullRequests).toEqual([]);
  expect(await env.origin.git(["branch", "--list", env.branch])).toBe("");
};

const remoteHasBranch = async (env: ShipEnv): Promise<boolean> =>
  (await env.origin.git(["branch", "--list", env.branch])) !== "";

describe("a failure before the commit rolls back and the next run starts clean", () => {
  shipTest("the ship checks fail", { edits: SOURCE, plan: RELEASABLE }, async (env) => {
    env.checkReplies.push({ code: 1, stdout: "lint error in feature.ts" });
    const first = await env.ship();
    expect(failureOf(first)).toMatchObject({
      kind: "checks-failed",
      report: { passed: false, kind: "ship" }
    });
    await expectRolledBack(env);
    expect(await env.hookLog()).toEqual([]);

    const second = await env.ship();
    expect(second).toMatchObject({ status: "shipped" });
    expect(await env.commitCount()).toBe(1);
    expect(pnpmRuns(env, "check")).toBe(2);
    expectSafeCalls(env);
  });

  shipTest("a commit hook refuses", { edits: SOURCE, plan: RELEASABLE }, async (env) => {
    await env.failHook("commit-msg", true);
    const first = await env.ship();
    expect(failureOf(first)).toMatchObject({
      kind: "hook-failed",
      hook: "commit",
      log: expect.stringContaining("commit-msg rejects")
    });
    await expectRolledBack(env);
    // Nothing else was attempted: no push, no PR.
    expect(await env.hookLog()).toEqual(["pre-commit", "commit-msg"]);

    await env.failHook("commit-msg", false);
    await env.failHook("pre-commit", true);
    expect(failureOf(await env.ship())).toMatchObject({ kind: "hook-failed", hook: "commit" });
    await expectRolledBack(env);
    expect(await env.hookLog()).toEqual(["pre-commit", "commit-msg", "pre-commit"]);

    await env.failHook("pre-commit", false);
    expect(await env.ship()).toMatchObject({ status: "shipped" });
    expect(await env.commitCount()).toBe(1);
    // The passed ship report matched the code again, so the checks never ran twice.
    expect(pnpmRuns(env, "check")).toBe(1);
    expect(await filesInCommit(env)).toEqual([
      ".changeset/export-reports.md",
      "tooling/desk/src/feature.ts"
    ]);
    expectSafeCalls(env);
  });

  shipTest(
    "a bad message, bad attribution, a bad changeset plan or a bad identity stop the run before any change",
    { edits: SOURCE, plan: RELEASABLE },
    async (env) => {
      env.commitlintReplies.push({ code: 1, stdout: "subject may not be empty" });
      expect(failureOf(await env.ship())).toMatchObject({
        kind: "commit-message-invalid",
        output: expect.stringContaining("subject may not be empty")
      });
      await expectRolledBack(env);

      await env.setPlan({
        ...RELEASABLE,
        summary: "Add the export.\n\nCo-Authored-By: Claude <noreply@anthropic.com>"
      });
      const attribution = failureOf(await env.ship());
      expect(attribution).toMatchObject({ kind: "attribution" });
      if (attribution.kind === "attribution") {
        expect(attribution.violations.map((violation) => violation.source)).toEqual(
          expect.arrayContaining(["commit-message", "pr-body"])
        );
      }
      await expectRolledBack(env);

      await env.setPlan({
        changeset: { required: true, packages: ["@repo/ghost"], bump: "patch" }
      });
      expect(failureOf(await env.ship())).toMatchObject({ kind: "changeset-invalid" });
      await expectRolledBack(env);

      await env.setPlan({});
      await env.clone.git(["config", "user.name", "Claude"]);
      expect(failureOf(await env.ship())).toMatchObject({ kind: "git-identity" });
      await env.clone.git(["config", "user.name", "Ognjen Test"]);
      await env.clone.git(["config", "--unset", "user.email"]);
      expect(failureOf(await env.ship())).toMatchObject({ kind: "git-identity" });
      await expectRolledBack(env);
      expect(await env.hookLog()).toEqual([]);

      // With the identity back and the plan clean, the same repository ships.
      await env.clone.git(["config", "user.email", "ognjen@example.test"]);
      await env.setPlan(RELEASABLE);
      expect(await env.ship()).toMatchObject({ status: "shipped" });
      expect(await env.commitCount()).toBe(1);
    }
  );

  shipTest(
    "a crash left a changeset file that no commit holds",
    { edits: SOURCE, plan: RELEASABLE },
    async (env) => {
      const stale = "---\n---\n\nStale text from a crashed run.\n";
      await mkdir(path.join(env.worktree, ".changeset"), { recursive: true });
      await writeFile(path.join(env.worktree, ".changeset/export-reports.md"), stale);
      await writeFile(
        path.join(env.artifactsDir, SHIP_RECORD_FILE),
        JSON.stringify({
          version: 1,
          branch: env.branch,
          baseSha: env.baseSha,
          changeset: { kind: "none", reason: "from a crashed run" },
          pendingChangeset: { path: ".changeset/export-reports.md", content: stale },
          checkedDiffHash: null,
          committedDiffHash: null,
          commitSha: null,
          rebased: false,
          pullRequest: null
        })
      );
      expect(await env.ship()).toMatchObject({ status: "shipped" });
      const text = await readFile(path.join(env.worktree, ".changeset/export-reports.md"), "utf8");
      expect(text).toContain('"@repo/desk": minor');
      expect(text).not.toContain("Stale");
      expect(await env.commitCount()).toBe(1);
    }
  );
});

describe("a failure after the commit keeps the commit and the next run continues", () => {
  shipTest(
    "a pre-push hook or the remote refuses the push",
    { edits: SOURCE, plan: RELEASABLE },
    async (env) => {
      await env.failHook("pre-push", true);
      const first = await env.ship();
      expect(failureOf(first)).toMatchObject({
        kind: "hook-failed",
        hook: "push",
        log: expect.stringContaining("pre-push rejects"),
        progress: { commitSha: expect.any(String), rebased: false }
      });
      expect(await env.commitCount()).toBe(1);
      expect(await worktreeStatus(env)).toBe("");
      expect(await remoteHasBranch(env)).toBe(false);
      expect(env.github.createdPullRequests).toEqual([]);

      // The next run reuses the commit. The remote now refuses.
      await env.failHook("pre-push", false);
      await env.failHook("pre-receive", true);
      expect(failureOf(await env.ship())).toMatchObject({ kind: "push-rejected" });
      expect(await env.commitCount()).toBe(1);
      expect(env.github.createdPullRequests).toEqual([]);

      await env.failHook("pre-receive", false);
      const last = await env.ship();
      expect(last).toMatchObject({ status: "shipped", prNumber: 101, rebased: false });
      // One commit, one run of the commit hooks, one PR, the checks ran once, and nothing was forced.
      expect(await env.commitCount()).toBe(1);
      const log = await env.hookLog();
      expect(log.filter((name) => name === "pre-commit")).toHaveLength(1);
      expect(log.filter((name) => name === "commit-msg")).toHaveLength(1);
      expect(log.filter((name) => name === "pre-push")).toHaveLength(3);
      expect(env.github.createdPullRequests).toHaveLength(1);
      expect(pnpmRuns(env, "check")).toBe(1);
      expect(await filesInCommit(env)).toEqual([
        ".changeset/export-reports.md",
        "tooling/desk/src/feature.ts"
      ]);
      expectSafeCalls(env);
    }
  );

  shipTest("the PR cannot be created", { edits: SOURCE }, async (env) => {
    let broken = true;
    const flaky: GitHubPort = {
      ...env.github,
      createPullRequest: (request) =>
        broken
          ? Promise.reject(new Error("gh pr create failed (exit 1): HTTP 502"))
          : env.github.createPullRequest(request)
    };
    const deps = { ...env.deps, github: flaky };
    const first = await shipIssue(deps, { issue: ISSUE, confirm: true });
    expect(failureOf(first)).toMatchObject({
      kind: "pull-request-failed",
      message: expect.stringContaining("HTTP 502")
    });
    expect(await remoteHasBranch(env)).toBe(true);

    broken = false;
    const second = await shipIssue(deps, { issue: ISSUE, confirm: true });
    expect(second).toMatchObject({ status: "shipped", prNumber: 101 });
    expect(await env.commitCount()).toBe(1);
    expect(env.github.createdPullRequests).toHaveLength(1);
  });

  shipTest(
    "a second ship after success changes nothing",
    { edits: SOURCE, plan: RELEASABLE },
    async (env) => {
      const first = await env.ship();
      const second = await env.ship();
      expect(first.status).toBe("shipped");
      expect(second).toMatchObject({
        status: "shipped",
        reusedPullRequest: true,
        prNumber: 101,
        changeset: { kind: "file", path: ".changeset/export-reports.md" }
      });
      if (first.status === "shipped" && second.status === "shipped") {
        expect(second.commitSha).toBe(first.commitSha);
      }
      expect(await env.commitCount()).toBe(1);
      expect(env.github.createdPullRequests).toHaveLength(1);
      expect(pnpmRuns(env, "check")).toBe(1);
      expect((await env.hookLog()).filter((name) => name === "pre-commit")).toHaveLength(1);
      expectSafeCalls(env);
    }
  );

  shipTest(
    "the fetch fails, and later the code changes after the commit",
    { edits: SOURCE },
    async (env) => {
      const url = await env.clone.git(["remote", "get-url", "origin"]);
      await env.clone.git(["remote", "set-url", "origin", path.join(env.scratch.root, "gone.git")]);
      await env.refreshArtifacts();
      expect(failureOf(await env.ship())).toMatchObject({ kind: "fetch-failed" });
      expect(await env.commitCount()).toBe(1);
      expect(env.github.createdPullRequests).toEqual([]);

      // The tree is dirty now, so the old commit is not "ours" any more: the gate sees changed code.
      await env.clone.git(["remote", "set-url", "origin", url]);
      await writeFile(
        path.join(env.worktree, "tooling/desk/src/feature.ts"),
        "export const feature = 9;\n"
      );
      const result = await env.ship();
      expect(refusalKinds(result)).toEqual(
        expect.arrayContaining(["checks-stale", "review-stale"])
      );
      expect(await env.commitCount()).toBe(1);
    }
  );
});

describe("rebase", () => {
  const pushUpstream = async (env: ShipEnv, files: Record<string, string>): Promise<string> => {
    for (const [file, content] of Object.entries(files)) await env.clone.write(file, content);
    await env.clone.git(["add", "-A"]);
    await env.clone.git([
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--quiet",
      "-m",
      "upstream change"
    ]);
    const sha = await env.clone.git(["rev-parse", "HEAD"]);
    // The test repository's own hooks must not log this push as the ship step's.
    await env.clone.git(["-c", "core.hooksPath=/dev/null", "push", "--quiet", "origin", "main"]);
    return sha;
  };
  const rebaseRefs = async (env: ShipEnv): Promise<string> =>
    env.clone.git(["rev-parse", "--git-path", "rebase-merge"], env.worktree);

  shipTest(
    "a clean rebase runs the checks again and pushes the rebased commit",
    { edits: SOURCE },
    async (env) => {
      const upstream = await pushUpstream(env, { "upstream.txt": "from main\n" });
      const result = await env.ship();
      expect(result).toMatchObject({ status: "shipped", rebased: true, baseSha: upstream });
      expect(pnpmRuns(env, "check")).toBe(2);
      const events = env.events.flatMap((event) =>
        event.type === "step" && event.step === "rebase" ? [event.status] : []
      );
      expect(events).toEqual(["start", "done"]);
      // The branch on the remote sits on top of the upstream commit with one commit of ours.
      expect(
        await env.origin.git(["rev-list", "--count", `${upstream}..refs/heads/${env.branch}`])
      ).toBe("1");
      await env.origin.git(["merge-base", "--is-ancestor", upstream, `refs/heads/${env.branch}`]);
      expect(await worktreeStatus(env)).toBe("");
      expectSafeCalls(env);
    }
  );

  shipTest(
    "checks that fail after the rebase stop the ship before the push",
    { edits: SOURCE },
    async (env) => {
      const upstream = await pushUpstream(env, { "upstream.txt": "from main\n" });
      env.checkReplies.push({ code: 0 }, { code: 1, stdout: "broke after rebase" });
      const first = await env.ship();
      expect(failureOf(first)).toMatchObject({
        kind: "checks-failed",
        message: expect.stringContaining("after the rebase"),
        progress: { baseSha: upstream, rebased: true, commitSha: expect.any(String) }
      });
      expect((await env.hookLog()).includes("pre-push")).toBe(false);
      expect(await remoteHasBranch(env)).toBe(false);

      // The next run is a resume: it sees the failed ship report and refuses.
      const second = await env.ship();
      expect(refusalKinds(second)).toEqual(["checks-failed"]);
      expect(await remoteHasBranch(env)).toBe(false);
    }
  );

  shipTest(
    "a conflict aborts the rebase, leaves the commit and the branch intact, and is typed",
    { edits: { "src/seed.ts": "export const seed = 2;\n" } },
    async (env) => {
      await pushUpstream(env, { "src/seed.ts": "export const seed = 3;\n" });
      const first = await env.ship();
      expect(failureOf(first)).toMatchObject({ kind: "rebase-conflict", files: ["src/seed.ts"] });
      // The rebase was aborted: no rebase directory, our branch, our commit, a clean tree.
      expect(await fileExists(path.resolve(env.worktree, await rebaseRefs(env)))).toBe(false);
      expect(await env.clone.git(["symbolic-ref", "--short", "HEAD"], env.worktree)).toBe(
        env.branch
      );
      expect(await worktreeStatus(env)).toBe("");
      expect(await env.commitCount()).toBe(1);
      expect(await remoteHasBranch(env)).toBe(false);
      expect((await env.hookLog()).includes("pre-push")).toBe(false);

      // Running it again gives the same answer and adds no commit.
      const second = await env.ship();
      expect(failureOf(second)).toMatchObject({ kind: "rebase-conflict" });
      expect(
        await env.clone.git(["rev-list", "--count", `${env.baseSha}..HEAD`], env.worktree)
      ).toBe("1");
      const record = shipRecordSchema.parse(
        JSON.parse(await readFile(path.join(env.artifactsDir, SHIP_RECORD_FILE), "utf8"))
      );
      expect(record.commitSha).not.toBeNull();
    }
  );
});
