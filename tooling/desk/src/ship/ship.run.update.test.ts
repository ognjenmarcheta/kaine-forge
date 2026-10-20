import { rename } from "node:fs/promises";
import path from "node:path";
import { describe, expect, vi } from "vitest";

import { SHIP_RECORD_FILE, type ShipResult } from "./ship.contract";
import {
  expectSafeCalls,
  filesInCommit,
  pnpmRuns,
  refusalKinds,
  shipTest,
  type ShipEnv
} from "./ship.testing";
import { ISSUE } from "../testing/pipeline.testing";

/**
 * The ship of a PR feedback round: the issue already has an open PR. The ship commits on the
 * pushed head, pushes to the same branch without force, and opens no second PR. It never
 * fetches or rebases, and it reads the PR again right before the push.
 */

// Real git, a local bare "origin", real hooks. Every git call is slow on a busy machine.
vi.setConfig({ testTimeout: 180_000 });

const FEATURE = "tooling/desk/src/feature.ts";
const SOURCE = { [FEATURE]: "export const feature = 1;\n" };
const ROUND = { [FEATURE]: "export const feature = 2;\n" };
const RELEASABLE = {
  changeset: { required: true, packages: ["@repo/desk"], bump: "minor" as const }
};
const PR_URL = "https://github.com/octo-owner/repo/pull/101";

/** No call of any ship run merges, approves, readies, auto-merges, or forces. */
const expectNoForbiddenCalls = (env: ShipEnv): void => {
  expectSafeCalls(env);
  const forbidden = ["--force", "--force-with-lease", "merge", "--admin", "ready", "--approve"];
  for (const call of env.calls) {
    for (const word of [...forbidden, "--auto"]) expect(call.argv).not.toContain(word);
    if (call.argv[1] === "push") expect(call.argv).not.toContain("-f");
  }
};

const shippedOf = (result: ShipResult) => {
  if (result.status !== "shipped") {
    throw new Error(`expected a shipped result, got ${JSON.stringify(result).slice(0, 800)}`);
  }
  return result;
};

const failureOf = (result: ShipResult) => {
  if (result.status !== "failed") {
    throw new Error(`expected a failed result, got ${JSON.stringify(result).slice(0, 800)}`);
  }
  return result.failure;
};

/**
 * Ship once, then set the issue up as the runner leaves it after a PR feedback round: the PR
 * on record, the ship record archived, and new reviewed and checked code in the worktree.
 */
const firstShipThenRound = async (env: ShipEnv): Promise<string> => {
  const first = shippedOf(await env.ship());
  const read = await env.store.read(ISSUE);
  if (read.status !== "ok") throw new Error("state");
  await env.store.write({
    ...read.state,
    prNumber: first.prNumber,
    prUrl: first.prUrl,
    prHeadSha: first.commitSha,
    commitSha: first.commitSha,
    prRounds: 1,
    history: [
      ...read.state.history,
      { at: "2026-10-07T09:00:00.000Z", stage: "ship", event: "pr-opened", note: PR_URL }
    ]
  });
  await rename(
    path.join(env.artifactsDir, SHIP_RECORD_FILE),
    path.join(env.artifactsDir, "ship-record.round-0.json")
  );
  await env.rewrite(ROUND);
  env.github.setPullRequestHead(first.commitSha);
  env.resetCalls();
  return first.commitSha;
};

const remoteHead = (env: ShipEnv): Promise<string> =>
  env.origin.git(["rev-parse", `refs/heads/${env.branch}`]);

/** Move `ref` in the bare origin to a new commit with the same tree, as another push would. */
const pushElsewhere = async (env: ShipEnv, ref: string, parent: string): Promise<string> => {
  const sha = await env.origin.git([
    "commit-tree",
    `${parent}^{tree}`,
    "-p",
    parent,
    "-m",
    "someone else"
  ]);
  await env.origin.git(["update-ref", ref, sha]);
  return sha;
};

describe("an update ship of a PR feedback round", () => {
  shipTest(
    "commits on the pushed head, pushes to the same branch, and opens no second PR",
    { edits: SOURCE, plan: RELEASABLE },
    async (env) => {
      const pushed = await firstShipThenRound(env);
      // main moved on GitHub. An update does not follow it.
      const upstream = await pushElsewhere(env, "refs/heads/main", env.baseSha);
      const hooksBefore = (await env.hookLog()).length;

      const result = shippedOf(await env.ship());
      expect(result).toMatchObject({
        prNumber: 101,
        prUrl: PR_URL,
        updated: true,
        rebased: false,
        baseSha: env.baseSha,
        changeset: { kind: "none" }
      });
      expect(await env.clone.git(["rev-parse", "HEAD~1"], env.worktree)).toBe(pushed);
      expect(await remoteHead(env)).toBe(result.commitSha);
      expect(
        await env.clone.git(["merge-base", "--is-ancestor", upstream, "HEAD"], env.worktree).then(
          () => true,
          () => false
        )
      ).toBe(false);

      // One new commit with the round's code only: the first ship's changeset is not repeated.
      expect(await filesInCommit(env)).toEqual([FEATURE]);
      expect(await env.clone.git(["log", "-1", "--format=%s"], env.worktree)).toBe(
        "fix: address PR feedback (round 1)"
      );
      expect(env.github.createdPullRequests).toHaveLength(1);
      expect(env.github.pullRequestLookups.at(-1)).toBe(env.branch);
      expect((await env.hookLog()).slice(hooksBefore)).toEqual([
        "pre-commit",
        "commit-msg",
        "pre-push",
        "pre-receive"
      ]);
      const git = env.calls.filter((call) => call.argv[0] === "git").map((call) => call.argv[1]);
      expect(git).not.toContain("fetch");
      expect(git).not.toContain("rebase");
      expectNoForbiddenCalls(env);
    }
  );

  shipTest(
    "refuses a closed PR before any change",
    { edits: SOURCE, plan: RELEASABLE },
    async (env) => {
      await firstShipThenRound(env);
      env.github.setPullRequestState("CLOSED");
      const hooksBefore = await env.hookLog();

      expect(refusalKinds(await env.ship())).toEqual(["pr-not-open"]);
      expect(await env.commitCount()).toBe(1);
      expect(await env.hookLog()).toEqual(hooksBefore);
      expect(pnpmRuns(env, "check")).toBe(0);
      expectNoForbiddenCalls(env);
    }
  );

  shipTest(
    "fails closed when the PR head moves before the push, and leaves the remote alone",
    { edits: SOURCE, plan: RELEASABLE },
    async (env) => {
      const pushed = await firstShipThenRound(env);
      const result = await env.ship(
        {},
        {
          onEvent: (event) => {
            if (event.type === "step" && event.step === "commit" && event.status === "done") {
              env.github.setPullRequestHead("d".repeat(40));
            }
          }
        }
      );
      const failure = failureOf(result);
      expect(failure.kind).toBe("pr-changed");
      expect(failure.kind === "pr-changed" && failure.failures.map((item) => item.kind)).toEqual([
        "pr-head-moved"
      ]);
      expect(await remoteHead(env)).toBe(pushed);
      expect(env.calls.some((call) => call.argv[1] === "push")).toBe(false);
      expectNoForbiddenCalls(env);
    }
  );

  shipTest(
    "opens no PR when the branch's open PR is another one",
    { edits: SOURCE, plan: RELEASABLE },
    async (env) => {
      await firstShipThenRound(env);
      const other = { number: 202, url: "https://github.com/octo-owner/repo/pull/202" };
      const failure = failureOf(
        await env.ship(
          {},
          { github: { ...env.github, findPullRequest: () => Promise.resolve(other) } }
        )
      );
      expect(failure.kind).toBe("pr-changed");
      expect(failure.kind === "pr-changed" && failure.failures.map((item) => item.kind)).toEqual([
        "pr-mismatch"
      ]);
      expect(env.github.createdPullRequests).toHaveLength(1);
      expectNoForbiddenCalls(env);
    }
  );

  shipTest(
    "does not push again when it resumes after a push that went through",
    { edits: SOURCE, plan: RELEASABLE },
    async (env) => {
      await firstShipThenRound(env);
      const lost = await env.ship(
        {},
        { github: { ...env.github, findPullRequest: () => Promise.reject(new Error("HTTP 502")) } }
      );
      expect(failureOf(lost).kind).toBe("pull-request-failed");
      const pushedNow = await remoteHead(env);
      expect(pushedNow).toBe(await env.clone.git(["rev-parse", "HEAD"], env.worktree));
      // GitHub shows the pushed commit as the head now.
      env.github.setPullRequestHead(pushedNow);
      const hooksBefore = (await env.hookLog()).length;
      env.resetCalls();

      expect(shippedOf(await env.ship())).toMatchObject({ commitSha: pushedNow, updated: true });
      expect(env.calls.some((call) => call.argv[1] === "push")).toBe(false);
      expect((await env.hookLog()).slice(hooksBefore)).toEqual([]);
      expect(await env.commitCount()).toBe(2);
      expectNoForbiddenCalls(env);
    }
  );

  shipTest(
    "gets a rejected push, never a forced one, when the branch has a commit it does not know",
    { edits: SOURCE, plan: RELEASABLE },
    async (env) => {
      const pushed = await firstShipThenRound(env);
      // GitHub has not reported the new commit yet, so the PR read still shows the old head.
      const extra = await pushElsewhere(env, `refs/heads/${env.branch}`, pushed);

      const failure = failureOf(await env.ship());
      expect(failure.kind).toBe("push-rejected");
      expect(await remoteHead(env)).toBe(extra);
      expect(env.github.createdPullRequests).toHaveLength(1);
      expectNoForbiddenCalls(env);
    }
  );
});
