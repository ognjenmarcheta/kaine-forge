import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";

import { runChecks } from "../check";
import type { FlowStep, IssueState } from "../contracts";
import { createPipelineRunner, type PipelineRunner } from "./pipeline.runner";
import type { IsolatedCheckRequest, IsolationPort } from "../isolation/isolation.port";
import { createLogSink } from "../log/log.writer";
import { REFS_BASELINE_FILE, SHIP_PLAN_FILE, SHIP_RECORD_FILE } from "../ship/ship.contract";
import { SHIP_REPO_FILES } from "../ship/ship.testing";
import { DEFAULT_SNAPSHOT, writeFiles } from "../testing/flow.testing";
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

/** A Docker port that records the check requests and runs them on the host. */
interface RecordingDocker extends IsolationPort {
  readonly checks: IsolatedCheckRequest[];
}

const recordingDocker = (runner: () => PipelineEnv["runner"]): RecordingDocker => {
  const checks: IsolatedCheckRequest[] = [];
  return {
    mode: "docker",
    checks,
    preflight: () => Promise.resolve(null),
    runnerFor: () => runner(),
    runChecks: (request) => {
      checks.push(request);
      return runChecks(request);
    },
    removeContainers: () => Promise.resolve(null),
    removeIssue: () => Promise.resolve(null)
  };
};

const open = async (docker?: IsolationPort): Promise<ShipHarness> => {
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
    ],
    ...(docker === undefined ? {} : { docker })
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
const toPrReview = async (
  h: ShipHarness,
  isolation?: IssueState["isolation"]
): Promise<IssueState> => {
  expect(
    await h.pipeline.start(ISSUE, {
      override: false,
      ...(isolation === undefined ? {} : { isolation })
    })
  ).toMatchObject({
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

    // The ship. The issue then waits at `pr-open` until the owner merges on GitHub.
    const result = await h.pipeline.ship(ISSUE, { confirm: true });
    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    const shipped = await h.state();
    expect(shipped).toMatchObject({
      stage: "pr-open",
      status: "waiting",
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
    expect(shipped.prHeadSha).toBe(head);
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
      kind: "gate",
      stage: "pr-open",
      message: "Draft PR: https://github.com/octo-owner/repo/pull/101"
    });
    expectSafeCalls(h.env);

    // The artifacts and the history tell the story.
    await readFile(h.artifacts(REFS_BASELINE_FILE), "utf8");
    await readFile(h.artifacts(SHIP_RECORD_FILE), "utf8");
    expect(shipped.history.map((entry) => `${entry.stage}:${entry.event}`).slice(-3)).toEqual([
      "pr-review:ship-confirmed",
      "ship:stage-started",
      "ship:pr-opened"
    ]);

    // The ship steps went to the persistent log. It holds no secret.
    const log = await h.flushLog();
    expect(log).toContain("ship push done");
    expect(log).toContain("ship pull-request done");

    // A refresh while the PR is open changes nothing.
    const waiting = await readFile(stateFile, "utf8");
    expect(await h.pipeline.refreshPr(ISSUE)).toMatchObject({
      outcome: "stopped",
      stop: "gate",
      message: "PR #101 is still open: https://github.com/octo-owner/repo/pull/101"
    });
    expect(await readFile(stateFile, "utf8")).toBe(waiting);

    // The owner merges on GitHub. The next refresh ends the issue and drops the desk label.
    h.env.github.setPullRequestState("MERGED");
    expect(await h.pipeline.refreshPr(ISSUE)).toMatchObject({
      outcome: "stopped",
      stop: "shipped"
    });
    expect(await h.state()).toMatchObject({ stage: "shipped", status: "done" });
    expect(h.env.github.labelEdits.at(-1)?.change).toEqual({ add: [], remove: ["agent:pr-open"] });
    expect(h.env.notifications.at(-1)).toMatchObject({
      kind: "done",
      message: "PR merged: https://github.com/octo-owner/repo/pull/101"
    });
    expect(h.env.github.pullRequestViews).toEqual([101, 101]);

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
    expect(retried).toMatchObject({ outcome: "stopped", stop: "gate" });
    const shipped = await h.state();
    expect(shipped).toMatchObject({ stage: "pr-open", status: "waiting", prNumber: 101 });
    expect(await commitCount(h, shipped)).toBe(1);
    expect(shipped.commitSha).toBe(stopped.commitSha);
    expect(await remoteBranches(h)).toEqual([branch, "main"].sort());
    expect(h.env.github.createdPullRequests).toHaveLength(1);
    expect((await h.hookLog()).filter((name) => name === "pre-commit")).toHaveLength(1);
    expect(h.env.github.labelEdits.at(-1)?.change.add).toEqual(["agent:pr-open"]);
    expectSafeCalls(h.env);
  });
});

describe("ship in Docker mode", () => {
  it("runs the ship checks through the Docker port, like the loop checks", async () => {
    const holder: { env: PipelineEnv | null } = { env: null };
    const docker = recordingDocker(() => {
      if (holder.env === null) throw new Error("the environment is not ready");
      return holder.env.runner;
    });
    const h = await open(docker);
    holder.env = h.env;
    await toPrReview(h, "docker");

    expect(await h.pipeline.ship(ISSUE, { confirm: true })).toMatchObject({
      outcome: "stopped",
      stop: "gate",
      state: { stage: "pr-open" }
    });
    expect(docker.checks.map((request) => [request.kind, request.issue])).toEqual([
      ["loop", ISSUE],
      ["ship", ISSUE]
    ]);
  });

  it("refuses to run the ship checks on the host when this process has no Docker support", async () => {
    const h = await open();
    const state = await toPrReview(h);
    // The issue was started with Docker by another process.
    await h.env.store.write({ ...state, isolation: "docker" });

    const result = await h.pipeline.ship(ISSUE, { confirm: true });
    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    expect(result.outcome === "stopped" ? result.message : "").toContain(
      "Docker isolation is requested"
    );
    expect(h.env.pnpm.calls.filter((call) => call.argv.join(" ") === "pnpm check")).toEqual([]);
    expect(await commitCount(h, state)).toBe(0);
  });
});

describe("refresh at pr-open", () => {
  const PR_URL = "https://github.com/octo-owner/repo/pull/101";
  const prOpen = (over: Partial<IssueState> = {}): IssueState => ({
    schemaVersion: 2,
    flowSnapshot: DEFAULT_SNAPSHOT,
    issueNumber: ISSUE,
    stage: "pr-open",
    status: "waiting",
    resumeStage: null,
    branch: "KAINE-7-feat-export-reports",
    worktreePath: null,
    sessions: {},
    loops: { check: 0, review: 0 },
    lastCheckFingerprint: null,
    history: [{ at: "2026-10-07T09:00:00Z", stage: "ship", event: "pr-opened", note: PR_URL }],
    authorization: null,
    prUrl: PR_URL,
    prNumber: 101,
    createdAt: "2026-10-07T09:00:00Z",
    updatedAt: "2026-10-07T09:00:00Z",
    ...over
  });
  const seeded = async (state: IssueState, options: { noWriteback?: boolean } = {}) => {
    env = await createPipelineEnv(options);
    await env.store.write(state);
    return env;
  };

  it("ends the issue at cancelled when the owner closed the PR without a merge", async () => {
    const e = await seeded(prOpen());
    e.github.setPullRequestState("CLOSED");
    expect(await e.pipeline.refreshPr(ISSUE)).toMatchObject({
      outcome: "stopped",
      stop: "cancelled"
    });
    const read = await e.store.read(ISSUE);
    expect(read.status === "ok" && read.state).toMatchObject({
      stage: "cancelled",
      status: "done"
    });
    expect(read.status === "ok" && read.state.history.at(-1)).toMatchObject({
      stage: "pr-open",
      event: "pr-closed"
    });
  });

  it("refuses a real ship for an issue that writes nothing to GitHub, and changes nothing", async () => {
    // Shipping would push and open a PR, and a later refresh could never end the issue.
    const e = await seeded(prOpen({ stage: "pr-review", prNumber: null, prUrl: null }), {
      noWriteback: true
    });
    const before = await readFile(e.store.statePath(ISSUE), "utf8");
    const result = await e.pipeline.ship(ISSUE, { confirm: true });
    expect(result).toMatchObject({ outcome: "refused", refusal: "ship-refused" });
    if (result.outcome === "refused") expect(result.reason).toContain("writes nothing to GitHub");
    expect(await readFile(e.store.statePath(ISSUE), "utf8")).toBe(before);
    expect(e.github.createdPullRequests).toEqual([]);
  });

  it("does not let continue park an issue without a PR at pr-open", async () => {
    const e = await seeded(
      prOpen({ stage: "needs-you", resumeStage: "build", prNumber: null, prUrl: null })
    );
    const before = await readFile(e.store.statePath(ISSUE), "utf8");
    expect(await e.pipeline.continueFrom(ISSUE, "pr-open")).toMatchObject({
      outcome: "refused",
      refusal: "invalid-transition"
    });
    expect(await readFile(e.store.statePath(ISSUE), "utf8")).toBe(before);
  });

  it.each([
    {
      name: "outside pr-open",
      state: prOpen({ stage: "pr-review" }),
      refusal: "invalid-transition"
    },
    { name: "without a PR number", state: prOpen({ prNumber: null }), refusal: "refresh-refused" },
    { name: "without write-back", state: prOpen(), noWriteback: true, refusal: "refresh-refused" }
  ])("refuses $name, reads no PR, and changes nothing", async ({ state, noWriteback, refusal }) => {
    const e = await seeded(state, { noWriteback: noWriteback === true });
    e.github.setPullRequestState("MERGED");
    const before = await readFile(e.store.statePath(ISSUE), "utf8");
    expect(await e.pipeline.refreshPr(ISSUE)).toMatchObject({ outcome: "refused", refusal });
    expect(await readFile(e.store.statePath(ISSUE), "utf8")).toBe(before);
    expect(e.github.pullRequestViews).toEqual([]);
  });
});

describe("ship in a flow of the repository's own", () => {
  const stepsOf = (...ids: string[]): FlowStep[] =>
    ids.map((id) => {
      const step = DEFAULT_SNAPSHOT.flow.steps.find((entry) => entry.id === id);
      if (step === undefined) throw new Error(`the default flow has no step '${id}'`);
      return step;
    });
  /** `.desk/flows/kaine-default.yaml` overrides the built-in flow by id for every new issue. */
  const useFlow = (h: ShipHarness, steps: readonly FlowStep[]): Promise<void> =>
    writeFiles(h.env.repoRoot, {
      ".desk/flows/kaine-default.yaml": stringify({ ...DEFAULT_SNAPSHOT.flow, steps })
    });
  const automaticShip: FlowStep = { id: "ship", kind: "ship", label: "Ship", auto: true };
  const eventsOf = (state: IssueState): string[] =>
    state.history.map((entry) => `${entry.stage}:${entry.event}`);

  it("ships a flow without a plan gate after the approval at its own gate", async () => {
    const h = await open();
    const qa: FlowStep = { id: "qa", kind: "gate", label: "QA", sendBack: ["build"] };
    await useFlow(h, [
      ...stepsOf("plan", "build", "check"),
      qa,
      ...stepsOf("review", "pr-review", "ship", "pr-open")
    ]);

    expect(await h.pipeline.start(ISSUE, { override: false })).toMatchObject({ stop: "gate" });
    expect((await h.state()).stage).toBe("qa");
    expect(await h.pipeline.approvePlan(ISSUE)).toMatchObject({ stop: "gate" });
    expect((await h.state()).stage).toBe("pr-review");

    const result = await h.pipeline.ship(ISSUE, { confirm: true });

    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    const shipped = await h.state();
    expect(shipped).toMatchObject({ stage: "pr-open", prNumber: 101 });
    expect(eventsOf(shipped)).toContain("qa:gate-approved");
    expect(h.env.github.createdPullRequests).toHaveLength(1);
    expectSafeCalls(h.env);
  });

  it("ships an automatic ship without a confirmation, as a draft PR, and records that it was automatic", async () => {
    const h = await open();
    await useFlow(h, [
      ...stepsOf("plan", "plan-gate", "build", "check", "review"),
      automaticShip,
      ...stepsOf("pr-open")
    ]);
    expect(await h.pipeline.start(ISSUE, { override: false })).toMatchObject({ stop: "gate" });

    // The plan approval is the last thing the owner does: review passes, and the ship follows.
    const result = await h.pipeline.approvePlan(ISSUE);

    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    const shipped = await h.state();
    expect(shipped).toMatchObject({ stage: "pr-open", status: "waiting", prNumber: 101 });
    expect(eventsOf(shipped)).toContain("ship:ship-automatic");
    expect(eventsOf(shipped).some((entry) => entry.endsWith(":ship-confirmed"))).toBe(false);
    expect(await commitCount(h, shipped)).toBe(1);
    expect(h.env.github.createdPullRequests).toEqual([
      expect.objectContaining({ base: "main", draft: true })
    ]);
    expectSafeCalls(h.env);
  });

  it("stops an automatic ship whose check report does not match the diff, and opens no PR", async () => {
    const h = await open();
    const last: FlowStep = {
      id: "last-look",
      kind: "gate",
      label: "Last look",
      sendBack: ["build"]
    };
    await useFlow(h, [
      ...stepsOf("plan", "plan-gate", "build", "check", "review"),
      last,
      automaticShip,
      ...stepsOf("pr-open")
    ]);
    await h.pipeline.start(ISSUE, { override: false });
    await h.pipeline.approvePlan(ISSUE);
    expect((await h.state()).stage).toBe("last-look");

    // The check report now describes another diff. Nothing else changes.
    const reportFile = h.artifacts("check-report.json");
    const report = await readFile(reportFile, "utf8");
    const stale = report.replace(/"diffHash": "[0-9a-f]{64}"/, `"diffHash": "${"0".repeat(64)}"`);
    expect(stale).not.toBe(report);
    await writeFile(reportFile, stale);

    const result = await h.pipeline.approvePlan(ISSUE);

    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    expect(result.outcome === "stopped" && result.message).toContain("- checks-stale:");
    const stopped = await h.state();
    expect(stopped).toMatchObject({ stage: "needs-you", resumeStage: "ship" });
    expect(eventsOf(stopped)).toContain("ship:ship-automatic");
    expect(await commitCount(h, stopped)).toBe(0);
    expect(await remoteBranches(h)).toEqual(["main"]);
    expect(h.env.github.createdPullRequests).toEqual([]);
  });
});
