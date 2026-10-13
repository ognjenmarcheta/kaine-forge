import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IssueState } from "../contracts";
import { createPipelineRunner, type PipelineRunner } from "./pipeline.runner";
import { createLogSink } from "../log/log.writer";
import { REFS_BASELINE_FILE, SHIP_PLAN_FILE, SHIP_RECORD_FILE } from "../ship/ship.contract";
import { SHIP_REPO_FILES } from "../ship/ship.testing";
import {
  ISSUE,
  FEATURE_FILE,
  FEATURE_TEST,
  builderOutput,
  createPipelineEnv,
  planOutput,
  reviewOutput,
  writeFeature,
  type PipelineEnv
} from "../testing/pipeline.testing";

/**
 * The whole pipeline against real git: intake, setup, plan, approval, build,
 * check, review, and then the ship step with a real commit, hooks, a local bare
 * "origin" and a fake GitHub. The agents are scripted, `pnpm` is scripted, and
 * nothing touches the network.
 */

// Real git, real hooks, and a full pipeline in one test. Process starts are slow on a loaded machine.
vi.setConfig({ testTimeout: 120_000 });

const SECRET = "ghp_1234567890abcdefABCDEF1234567890abcd";
const PLANNED_FILES = [FEATURE_TEST, FEATURE_FILE].sort();

interface ShipHarness {
  readonly env: PipelineEnv;
  readonly pipeline: PipelineRunner;
  readonly originDir: string;
  /** Make a hook fail with this text on stderr, or let it pass again with `null`. */
  readonly failHook: (hook: "pre-push", text: string | null) => Promise<void>;
  readonly hookLog: () => Promise<string[]>;
  readonly flushLog: () => Promise<string>;
  readonly state: () => Promise<IssueState>;
  readonly artifacts: (name: string) => string;
}

let env: PipelineEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

const hookScript = (root: string, name: string): string =>
  [
    "#!/bin/sh",
    `echo "${name}" >> "${root}/hooks.log"`,
    `if [ -e "${root}/fail-${name}" ]; then cat "${root}/fail-${name}" >&2; exit 1; fi`,
    "exit 0",
    ""
  ].join("\n");

const open = async (): Promise<ShipHarness> => {
  const template = await readFile(
    path.resolve(import.meta.dirname, "../../../../.github/pull_request_template.md"),
    "utf8"
  );
  const created = await createPipelineEnv({
    git: "real",
    extraFiles: { ...SHIP_REPO_FILES, ".github/pull_request_template.md": template },
    steps: [
      { role: "planner", output: planOutput() },
      { role: "builder", output: builderOutput(), effect: (run) => writeFeature(run) },
      { role: "reviewer", output: reviewOutput() }
    ]
  });
  env = created;
  const { clone, scratch } = created;
  if (clone === null) throw new Error("the ship tests need a real git clone");
  await clone.git(["config", "user.name", "Ognjen Test"]);
  await clone.git(["config", "user.email", "ognjen@example.test"]);
  for (const name of ["pre-commit", "commit-msg", "pre-push"]) {
    const file = path.join(clone.dir, ".git", "hooks", name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, hookScript(scratch.root, name));
    await chmod(file, 0o755);
  }

  // The same pipeline, with the persistent log the CLI keeps.
  const sink = createLogSink({ store: created.store, clock: created.deps.clock });
  const pipeline = createPipelineRunner({
    ...created.deps,
    onEvent: (event) => {
      created.deps.onEvent?.(event);
      sink.write(event);
    }
  });
  const marker = (hook: string): string => path.join(scratch.root, `fail-${hook}`);
  return {
    env: created,
    pipeline,
    originDir: path.join(scratch.root, "origin.git"),
    failHook: async (hook, text) => {
      if (text === null) await rm(marker(hook), { force: true });
      else await writeFile(marker(hook), `${hook} rejects: ${text}\n`);
    },
    hookLog: async () =>
      (await readFile(path.join(scratch.root, "hooks.log"), "utf8").catch(() => ""))
        .split("\n")
        .filter((line) => line !== ""),
    flushLog: async () => {
      await sink.flush();
      return readFile(path.join(created.store.issueDir(ISSUE), "agent.log.jsonl"), "utf8");
    },
    state: async () => {
      const read = await created.store.read(ISSUE);
      if (read.status !== "ok") throw new Error(`state is ${read.status}`);
      return read.state;
    },
    artifacts: (name) => path.join(created.store.artifactsDir(ISSUE), name)
  };
};

/** Drive the issue to `pr-review`. */
const toPrReview = async (h: ShipHarness): Promise<IssueState> => {
  expect(await h.pipeline.start(ISSUE, { override: false })).toMatchObject({
    outcome: "stopped",
    stop: "gate"
  });
  expect(await h.pipeline.approvePlan(ISSUE)).toMatchObject({ outcome: "stopped", stop: "gate" });
  const state = await h.state();
  expect(state).toMatchObject({ stage: "pr-review", status: "waiting" });
  return state;
};

const commitCount = async (h: ShipHarness, state: IssueState): Promise<number> =>
  Number(
    await h.env.clone?.git(
      ["rev-list", "--count", `${state.baseSha}..HEAD`],
      state.worktreePath ?? ""
    )
  );

const remoteBranches = async (h: ShipHarness): Promise<string[]> =>
  (await h.env.clone?.git(["for-each-ref", "--format=%(refname:short)", "refs/heads"], h.originDir))
    ?.split("\n")
    .filter((line) => line !== "") ?? [];

/** The rules that hold for every command of every ship: draft only, no force, no skipped hook, no merge. */
const expectSafeCalls = (e: PipelineEnv): void => {
  const unsafe = [
    "--no-verify",
    "-n",
    "--force",
    "-f",
    "--force-with-lease",
    "--force-if-includes",
    "--mirror",
    "--delete",
    "--amend"
  ];
  for (const call of e.pnpm.calls) {
    const [program, command] = call.argv;
    if (program === "gh") throw new Error(`the desk ran gh: ${call.argv.join(" ")}`);
    if (program !== "git" || !["commit", "push", "rebase"].includes(command ?? "")) continue;
    for (const flag of unsafe) expect(call.argv).not.toContain(flag);
    expect(call.argv.some((word) => word.startsWith("+"))).toBe(false);
  }
  for (const request of e.github.createdPullRequests) {
    expect(request.draft).toBe(true);
    expect(request.base).toBe("main");
  }
};

describe("the refs baseline", () => {
  it("is recorded after every agent stage and refused when it is missing", async () => {
    const h = await open();
    expect(await h.pipeline.start(ISSUE, { override: false })).toMatchObject({ stop: "gate" });
    const planned = await h.state();

    // After the planner: the refs as the planner left them.
    const baselineFile = h.artifacts(REFS_BASELINE_FILE);
    const afterPlan: unknown = JSON.parse(await readFile(baselineFile, "utf8"));
    expect(afterPlan).toMatchObject({ head: planned.baseSha, branch: planned.branch });

    // The builder and the reviewer write it again.
    await rm(baselineFile);
    await h.pipeline.approvePlan(ISSUE);
    const state = await h.state();
    expect(state.stage).toBe("pr-review");
    const afterReview: unknown = JSON.parse(await readFile(baselineFile, "utf8"));
    expect(afterReview).toEqual(await h.env.deps.git.refsSnapshot(state.worktreePath ?? ""));

    // Without a baseline the gate fails closed. Nothing changes.
    await rm(baselineFile);
    const before = await readFile(h.env.store.statePath(ISSUE), "utf8");
    const result = await h.pipeline.ship(ISSUE, { confirm: true });
    expect(result).toMatchObject({ outcome: "refused", refusal: "ship-refused" });
    expect(result.outcome === "refused" && result.reason).toContain("refs-baseline-missing");
    expect(await readFile(h.env.store.statePath(ISSUE), "utf8")).toBe(before);
    expect(await commitCount(h, state)).toBe(0);
    expect(h.env.github.createdPullRequests).toEqual([]);

    // A retry is only for a ship that the engineer confirmed and that then failed.
    expect(await h.pipeline.continueFrom(ISSUE, "ship")).toMatchObject({
      outcome: "refused",
      refusal: "ship-refused"
    });
    expect(await readFile(h.env.store.statePath(ISSUE), "utf8")).toBe(before);
  });
});

describe("ship, end to end with real git", () => {
  it("dry-runs, refuses without a yes, then commits, pushes, and opens a draft PR", async () => {
    const h = await open();
    const state = await toPrReview(h);
    const { worktreePath: worktree, branch, baseSha } = state;
    if (worktree === null || branch === null || baseSha === null || baseSha === undefined) {
      throw new Error("setup recorded no worktree, branch, or base");
    }
    const stateFile = h.env.store.statePath(ISSUE);

    // A dry run writes the plan and the PR body. It changes no state, commit, branch, or PR.
    const before = await readFile(stateFile, "utf8");
    const dry = await h.pipeline.ship(ISSUE, { confirm: false, dryRun: true });
    expect(dry).toMatchObject({ outcome: "dry-run" });
    if (dry.outcome !== "dry-run") return;
    expect(dry.plan.gate).toEqual({ ok: true, failures: [] });
    expect(dry.plan.files).toEqual(PLANNED_FILES);
    expect(dry.plan.pullRequest).toMatchObject({ base: "main", draft: true });
    expect(dry.files.plan).toBe(h.artifacts(SHIP_PLAN_FILE));
    expect(await readFile(dry.files.prBody, "utf8")).toContain(`Closes #${ISSUE}`);
    expect(await readFile(stateFile, "utf8")).toBe(before);
    expect(await commitCount(h, state)).toBe(0);
    expect(await remoteBranches(h)).toEqual(["main"]);
    expect(h.env.github.createdPullRequests).toEqual([]);
    expect(await h.hookLog()).toEqual([]);

    // No yes, no ship. Nothing changes.
    expect(await h.pipeline.ship(ISSUE, { confirm: false })).toMatchObject({
      outcome: "refused",
      refusal: "ship-refused"
    });
    expect(await readFile(stateFile, "utf8")).toBe(before);

    // The ship.
    const result = await h.pipeline.ship(ISSUE, { confirm: true });
    expect(result).toMatchObject({ outcome: "stopped", stop: "shipped" });
    const shipped = await h.state();
    expect(shipped).toMatchObject({
      stage: "shipped",
      status: "done",
      shipConfirmed: true,
      prNumber: 101,
      prUrl: "https://github.com/octo-owner/repo/pull/101",
      baseSha,
      activeProcess: null
    });

    // One commit, and it holds the planned files only.
    expect(await commitCount(h, shipped)).toBe(1);
    const head = await h.env.deps.git.headSha(worktree);
    expect(shipped.commitSha).toBe(head);
    expect(
      (await h.env.clone?.git(["show", "--name-only", "--format=", "HEAD"], worktree))
        ?.split("\n")
        .filter((line) => line !== "")
        .sort()
    ).toEqual(PLANNED_FILES);
    expect(await h.env.clone?.git(["status", "--porcelain"], worktree)).toBe("");
    expect(await h.hookLog()).toEqual(["pre-commit", "commit-msg", "pre-push"]);

    // The branch is on the bare origin, at the commit. The desk did not push main.
    expect(await remoteBranches(h)).toEqual([branch, "main"].sort());
    expect(await h.env.clone?.git(["rev-parse", `refs/heads/${branch}`], h.originDir)).toBe(head);

    // One draft PR, with the closing keyword, and the execution label moved to `agent:pr-open`.
    expect(h.env.github.createdPullRequests).toHaveLength(1);
    const pullRequest = h.env.github.createdPullRequests[0];
    expect(pullRequest).toMatchObject({ base: "main", head: branch, draft: true });
    expect(await readFile(pullRequest?.bodyFile ?? "", "utf8")).toContain(`Closes #${ISSUE}`);
    expect(h.env.github.labelEdits.at(-1)?.change.add).toEqual(["agent:pr-open"]);
    expect(h.env.github.comments.at(-1)?.body).toContain(
      "Draft PR: https://github.com/octo-owner/repo/pull/101"
    );
    expect(h.env.notifications.at(-1)).toMatchObject({
      kind: "done",
      stage: "shipped",
      message: "Draft PR: https://github.com/octo-owner/repo/pull/101"
    });
    expectSafeCalls(h.env);

    // The artifacts and the history tell the story.
    await readFile(h.artifacts(REFS_BASELINE_FILE), "utf8");
    await readFile(h.artifacts(SHIP_RECORD_FILE), "utf8");
    expect(shipped.history.map((entry) => `${entry.stage}:${entry.event}`).slice(-3)).toEqual([
      "pr-review:ship-confirmed",
      "ship:stage-started",
      "ship:shipped"
    ]);

    // The ship steps went to the persistent log. It holds no secret.
    const log = await h.flushLog();
    expect(log).toContain("ship push done");
    expect(log).toContain("ship pull-request done");

    // A shipped issue accepts no more ship.
    expect(await h.pipeline.ship(ISSUE, { confirm: true })).toMatchObject({
      outcome: "refused",
      refusal: "invalid-transition"
    });
  });

  it("stops at needs-you when a pre-push hook refuses, and a retry makes no second commit or PR", async () => {
    const h = await open();
    const state = await toPrReview(h);
    const { worktreePath: worktree, branch } = state;
    if (worktree === null || branch === null) throw new Error("setup recorded no worktree");

    await h.failHook("pre-push", `token=${SECRET}`);
    const failed = await h.pipeline.ship(ISSUE, { confirm: true });
    expect(failed).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    const stopped = await h.state();
    expect(stopped).toMatchObject({
      stage: "needs-you",
      status: "waiting",
      resumeStage: "ship",
      shipConfirmed: true,
      activeProcess: null
    });
    const reason = failed.outcome === "stopped" ? (failed.message ?? "") : "";
    expect(reason).toContain("Ship failed (hook-failed)");
    expect(reason).toContain("pre-push rejects");

    // The commit exists. The branch, the PR, and the `agent:pr-open` label do not.
    expect(await commitCount(h, stopped)).toBe(1);
    expect(stopped.commitSha ?? null).toBe(await h.env.deps.git.headSha(worktree));
    expect(await remoteBranches(h)).toEqual(["main"]);
    expect(h.env.github.createdPullRequests).toEqual([]);
    expect(h.env.github.labelEdits.at(-1)?.change.add).toEqual(["agent:needs-you"]);

    // The secret in the hook output reaches neither the state, nor the status comment, nor the log.
    const log = await h.flushLog();
    const everything = [
      await readFile(h.env.store.statePath(ISSUE), "utf8"),
      await readFile(h.env.store.eventsPath(ISSUE), "utf8"),
      h.env.github.comments.map((comment) => comment.body).join("\n"),
      log
    ].join("\n");
    expect(everything).not.toContain(SECRET);
    expect(everything).toContain("[redacted]");

    // `ship` itself starts only at pr-review. The way back is `continue`.
    expect(await h.pipeline.ship(ISSUE, { confirm: true })).toMatchObject({
      outcome: "refused",
      refusal: "invalid-transition"
    });

    // Fix the hook, continue: no second commit, no second hook run for the commit, one PR.
    await h.failHook("pre-push", null);
    const retried = await h.pipeline.continueFrom(ISSUE);
    expect(retried).toMatchObject({ outcome: "stopped", stop: "shipped" });
    const shipped = await h.state();
    expect(shipped).toMatchObject({ stage: "shipped", status: "done", prNumber: 101 });
    expect(await commitCount(h, shipped)).toBe(1);
    expect(shipped.commitSha).toBe(stopped.commitSha);
    expect(await remoteBranches(h)).toEqual([branch, "main"].sort());
    expect(h.env.github.createdPullRequests).toHaveLength(1);
    expect((await h.hookLog()).filter((name) => name === "pre-commit")).toHaveLength(1);
    expect(h.env.github.labelEdits.at(-1)?.change.add).toEqual(["agent:pr-open"]);
    expectSafeCalls(h.env);
  });
});
