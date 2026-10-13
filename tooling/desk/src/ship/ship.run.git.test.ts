import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, vi } from "vitest";

import { shipRecordSchema, SHIP_RECORD_FILE } from "./ship.contract";
import {
  expectSafeCalls,
  fileExists as exists,
  filesInCommit,
  gitArgv,
  refusalKinds,
  shipTest,
  worktreeStatus as status,
  type ShipEnv
} from "./ship.testing";
import { fakeGitHub, snapshotOf } from "../testing/github.fake";

// Real git, a local bare "origin", real hooks. Every git call is slow on a busy machine.
vi.setConfig({ testTimeout: 180_000 });

const SOURCE = { "tooling/desk/src/feature.ts": "export const feature = 1;\n" };
const RELEASABLE = {
  changeset: { required: true, packages: ["@repo/desk"], bump: "minor" as const }
};

describe("shipIssue: the happy path with real git", () => {
  shipTest(
    "commits exactly the diff and the changeset, pushes, and opens a draft PR",
    { edits: SOURCE, plan: RELEASABLE },
    async (env) => {
      const result = await env.ship();
      expect(result).toMatchObject({
        status: "shipped",
        prNumber: 101,
        reusedPullRequest: false,
        branch: env.branch,
        baseSha: env.baseSha,
        rebased: false,
        changeset: { kind: "file", path: ".changeset/export-reports.md", bump: "minor" }
      });
      if (result.status !== "shipped") return;

      // The commit holds the listed files and nothing else.
      expect(await filesInCommit(env)).toEqual([
        ".changeset/export-reports.md",
        "tooling/desk/src/feature.ts"
      ]);
      expect(await env.clone.git(["rev-parse", "HEAD"], env.worktree)).toBe(result.commitSha);
      expect(await env.commitCount()).toBe(1);
      expect(await status(env)).toBe("");

      // The message is Conventional, references the issue, and has the human author.
      const message = await env.clone.git(["log", "-1", "--format=%B"], env.worktree);
      expect(message).toMatch(
        /^feat: export reports as CSV\n\nAdd a CSV export for reports\n\nRefs #7/
      );
      expect(message).toContain("Refs #7");

      // The changeset file has the documented form.
      const changeset = await readFile(
        path.join(env.worktree, ".changeset/export-reports.md"),
        "utf8"
      );
      expect(changeset).toBe('---\n"@repo/desk": minor\n---\n\nAdd a CSV export for reports.\n');

      // Hooks ran, in order, for the commit and for the push.
      expect(await env.hookLog()).toEqual(["pre-commit", "commit-msg", "pre-push", "pre-receive"]);

      // The branch is on the remote at the commit.
      expect(await env.origin.git(["rev-parse", `refs/heads/${env.branch}`])).toBe(
        result.commitSha
      );

      // The PR is a draft against main with the commit header as title and Closes #7 in the body.
      expect(env.github.createdPullRequests).toHaveLength(1);
      const pullRequest = env.github.createdPullRequests[0];
      expect(pullRequest).toMatchObject({
        base: "main",
        head: env.branch,
        draft: true,
        title: "feat: export reports as CSV"
      });
      const body = await readFile(pullRequest?.bodyFile ?? "", "utf8");
      expect(body).toContain("Closes #7");
      expect(body).toContain("`pnpm check`: passed (ship check)");
      expect(env.github.pullRequestLabels).toEqual([]);

      // The record names the commit.
      const record = shipRecordSchema.parse(
        JSON.parse(await readFile(path.join(env.artifactsDir, SHIP_RECORD_FILE), "utf8"))
      );
      expect(record).toMatchObject({ commitSha: result.commitSha, pendingChangeset: null });
      expectSafeCalls(env);

      // The events name the steps, in order.
      const done = env.events.flatMap((event) =>
        event.type === "step" && event.status === "done" ? [event.step] : []
      );
      expect(done).toEqual([
        "gate",
        "identity",
        "checks",
        "changeset",
        "message",
        "stage",
        "commit",
        "fetch",
        "push",
        "pull-request"
      ]);
    }
  );

  shipTest(
    "applies the skip label when the plan says the change is not releasable",
    { edits: SOURCE },
    async (env) => {
      const result = await env.ship();
      expect(result).toMatchObject({
        status: "shipped",
        changeset: { kind: "skip-label", label: "release:skip-changeset", applied: true }
      });
      expect(env.github.pullRequestLabels).toEqual([{ pr: 101, label: "release:skip-changeset" }]);
      expect(await filesInCommit(env)).toEqual(["tooling/desk/src/feature.ts"]);
      expect(await exists(path.join(env.worktree, ".changeset/export-reports.md"))).toBe(false);
      expectSafeCalls(env);
    }
  );

  shipTest(
    "records a missing skip label instead of failing the ship",
    { edits: SOURCE, github: { failPullRequestLabel: true } },
    async (env) => {
      expect(await env.ship()).toMatchObject({
        status: "shipped",
        changeset: {
          kind: "skip-label",
          applied: false,
          labelNote: expect.stringContaining("not found")
        }
      });
    }
  );

  shipTest(
    "needs no changeset or label for docs, stages odd names literally, and skips ignored files",
    {
      edits: {
        "docs/guide.md": "# Guide\n",
        "docs/we[ir]d*.md": "a\n",
        "docs/-dash.md": "b\n",
        "docs/space name.md": "c\n",
        "ignored.log": "noise\n"
      },
      repoFiles: { ".gitignore": "ignored.log\n" }
    },
    async (env) => {
      expect(await env.ship()).toMatchObject({ status: "shipped", changeset: { kind: "none" } });
      expect(await filesInCommit(env)).toEqual([
        "docs/-dash.md",
        "docs/guide.md",
        "docs/space name.md",
        "docs/we[ir]d*.md"
      ]);
      expect(env.github.pullRequestLabels).toEqual([]);
    }
  );

  shipTest(
    "reuses a pull request that already exists for the branch",
    {
      edits: SOURCE,
      github: { existingPullRequest: { number: 55, url: "https://github.com/o/r/pull/55" } }
    },
    async (env) => {
      expect(await env.ship()).toMatchObject({
        status: "shipped",
        prNumber: 55,
        reusedPullRequest: true
      });
      expect(env.github.createdPullRequests).toEqual([]);
      expect(env.github.pullRequestLabels).toEqual([{ pr: 55, label: "release:skip-changeset" }]);
    }
  );
});

describe("shipIssue: the gate refuses before anything changes", () => {
  const expectUntouched = async (env: ShipEnv): Promise<void> => {
    expect(await env.commitCount()).toBe(0);
    expect(await env.hookLog()).toEqual([]);
    expect(env.github.createdPullRequests).toEqual([]);
    expect(await exists(path.join(env.artifactsDir, SHIP_RECORD_FILE))).toBe(false);
    expect(await exists(path.join(env.worktree, ".changeset/export-reports.md"))).toBe(false);
    expect(env.calls.some((call) => call.argv[0] === "pnpm")).toBe(false);
    const mutating = ["add", "commit", "push", "rebase", "reset"];
    expect(gitArgv(env).some((argv) => mutating.includes(argv[0] ?? ""))).toBe(false);
  };

  // One repository, many refusals: each case breaks one thing, checks the answer and the
  // untouched tree, and puts the thing back. This keeps the number of real repositories low.
  shipTest("refuses each broken rule and changes nothing", { edits: SOURCE }, async (env) => {
    const feature = path.join(env.worktree, "tooling/desk/src/feature.ts");
    const artifact = (name: string) => path.join(env.artifactsDir, name);
    const refused = async (
      name: string,
      kinds: string[],
      depsOver: Parameters<ShipEnv["ship"]>[1] = {},
      over: Parameters<ShipEnv["ship"]>[0] = {}
    ) => {
      env.resetCalls();
      const result = await env.ship(over, depsOver);
      expect(refusalKinds(result), name).toEqual(kinds);
      await expectUntouched(env);
    };
    const before = await status(env);

    await refused("no confirmation", ["not-confirmed"], {}, { confirm: false });
    expect(await status(env)).toBe(before);

    await refused("gh signed in as someone else", ["authorization-unavailable", "identity"], {
      github: fakeGitHub({ viewer: "intruder" })
    });
    await refused("issue text changed", ["authorization-changed"], {
      github: fakeGitHub({ snapshot: snapshotOf({ number: 7, body: "A different request now." }) })
    });

    await rename(artifact("review.json"), artifact("review.json.off"));
    await refused("no review", ["review-missing"]);
    await rename(artifact("review.json.off"), artifact("review.json"));

    await rename(artifact("refs-baseline.json"), artifact("refs-baseline.json.off"));
    await refused("no refs baseline", ["refs-baseline-missing"]);
    await rename(artifact("refs-baseline.json.off"), artifact("refs-baseline.json"));

    const state = await env.store.read(7);
    if (state.status !== "ok") throw new Error("state");
    await env.store.write({ ...state.state, history: [] });
    await refused("plan not approved", ["plan-not-approved"]);
    await env.store.write(state.state);

    await writeFile(feature, "export const feature = 2;\n");
    await refused("code changed after checks and review", ["checks-stale", "review-stale"]);
    await writeFile(feature, SOURCE["tooling/desk/src/feature.ts"]);

    await mkdir(path.join(env.worktree, ".husky"), { recursive: true });
    await writeFile(path.join(env.worktree, ".husky/pre-commit"), "exit 0\n");
    env.resetCalls();
    const protectedResult = await env.ship();
    expect(refusalKinds(protectedResult)).toContain("protected-paths");
    await expectUntouched(env);
    await rm(path.join(env.worktree, ".husky"), { recursive: true });

    // Last, because it cannot be undone: a commit made after the last agent stage.
    await env.clone.git(["commit", "--quiet", "--allow-empty", "-m", "sneaky"], env.worktree);
    env.resetCalls();
    expect(refusalKinds(await env.ship())).toContain("refs-changed");
    expect(gitArgv(env).some((argv) => ["add", "commit", "push"].includes(argv[0] ?? ""))).toBe(
      false
    );
  });

  shipTest(
    "ignores another issue's branch and a remote-tracking ref that moved",
    { edits: SOURCE },
    async (env) => {
      await env.clone.git(["branch", "KAINE-9-fix-other", env.baseSha]);
      await env.clone.git(["update-ref", "refs/remotes/origin/elsewhere", env.baseSha]);
      expect(await env.ship()).toMatchObject({ status: "shipped" });
    }
  );
});
