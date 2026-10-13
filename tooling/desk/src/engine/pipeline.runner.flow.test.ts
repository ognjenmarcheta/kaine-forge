import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IssueState } from "../contracts";
import { FAKE_BASE_SHA } from "../testing/git.fake";
import { snapshotOf } from "../testing/github.fake";
import {
  FEATURE_FILE,
  ISSUE,
  builderOutput,
  createPipelineEnv,
  planOutput,
  reviewOutput,
  writeFeature,
  type EnvOptions,
  type PipelineEnv,
  type ScriptedStep
} from "../testing/pipeline.testing";

vi.setConfig({ testTimeout: 30_000 });

let env: PipelineEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

const open = async (options: EnvOptions = {}): Promise<PipelineEnv> => {
  env = await createPipelineEnv(options);
  return env;
};

const planStep = (output = planOutput()): ScriptedStep => ({ role: "planner", output });
const buildStep = (over: Partial<ScriptedStep> = {}): ScriptedStep => ({
  role: "builder",
  output: builderOutput(),
  effect: (run) => writeFeature(run),
  ...over
});
const reviewStep = (output = reviewOutput()): ScriptedStep => ({ role: "reviewer", output });

const stateOf = async (e: PipelineEnv): Promise<IssueState> => {
  const read = await e.store.read(ISSUE);
  if (read.status !== "ok") throw new Error(`state is ${read.status}`);
  return read.state;
};

const events = async (e: PipelineEnv): Promise<string[]> =>
  (await stateOf(e)).history.map((entry) => `${entry.stage}:${entry.event}`);

const artifact = (e: PipelineEnv, name: string): Promise<string> =>
  readFile(path.join(e.store.artifactsDir(ISSUE), name), "utf8");

describe("pipeline runner: happy path", () => {
  it("runs from intake to the plan gate, then to pr-review after approval", async () => {
    const e = await open({ steps: [planStep(), buildStep(), reviewStep()] });

    const first = await e.pipeline.start(ISSUE, { override: false });
    expect(first).toMatchObject({ outcome: "stopped", stop: "gate" });
    expect((await stateOf(e)).stage).toBe("plan-gate");
    if (first.outcome === "stopped") {
      expect(first.message).toContain("Plan ready: Add a CSV export for reports");
      expect(first.message).toContain("No open questions.");
    }
    // Setup made a real worktree on the provisional branch and recorded the base.
    const afterPlan = await stateOf(e);
    expect(afterPlan).toMatchObject({
      branch: "KAINE-7-feat-export-reports",
      worktreePath: e.worktree(),
      status: "waiting"
    });
    expect(afterPlan.baseSha).toBe(FAKE_BASE_SHA);
    expect(afterPlan.sessions.planner).toBeDefined();
    expect(await artifact(e, "plan.md")).toContain("## Acceptance criteria");

    const second = await e.pipeline.approvePlan(ISSUE);
    expect(second).toMatchObject({ outcome: "stopped", stop: "gate" });
    const done = await stateOf(e);
    expect(done).toMatchObject({ stage: "pr-review", status: "waiting", activeProcess: null });
    expect(done.sessions.builder).toBeDefined();
    expect(done.pendingFeedback).toBeNull();

    expect(await events(e)).toEqual([
      "intake:intake-started",
      "setup:intake-complete",
      "setup:stage-started",
      "setup:setup-complete",
      "plan:stage-started",
      "plan:plan-ready",
      "plan-gate:plan-approved",
      "build:stage-started",
      "build:build-complete",
      "check:stage-started",
      "check:check-passed",
      "review:stage-started",
      "review:review-approved"
    ]);
    // events.jsonl holds the same history.
    const lines = (await readFile(e.store.eventsPath(ISSUE), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(done.history.length);

    // Artifacts of every stage.
    for (const name of [
      "ticket.md",
      "issue.json",
      "plan.json",
      "build.json",
      "check-report.json",
      "diff.patch",
      "review.json",
      "agent-planner.json",
      "agent-builder.json",
      "agent-reviewer.json"
    ]) {
      expect(await artifact(e, name)).not.toBe("");
    }
    expect(await artifact(e, "diff.patch")).toContain(`+++ b/${FEATURE_FILE}`);

    // The agents saw the right roles, sessions and providers.
    expect(e.runner.requests.map((r) => `${r.role}:${r.provider}`)).toEqual([
      "planner:claude",
      "builder:claude",
      "reviewer:codex"
    ]);
    const check = e.pnpm.calls.filter((c) => c.argv[1] === "check:affected");
    expect(check).toHaveLength(1);
    expect(check[0]?.cwd).toBe(e.worktree());
    // Notifications: one for each gate.
    expect(e.notifications.map((n) => `${n.stage}:${n.kind}`)).toEqual([
      "plan-gate:gate",
      "pr-review:gate"
    ]);
    // The agents never committed: HEAD is still the base.
    expect(await e.deps.git.headSha(e.worktree())).toBe(afterPlan.baseSha);
  });

  it("writes labels and one status comment after each transition", async () => {
    const e = await open({ steps: [planStep(), buildStep(), reviewStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    await e.pipeline.approvePlan(ISSUE);

    // Working while the engine drives, needs-you at the gates.
    const targets = e.github.labelEdits.map((edit) => edit.change.add[0]);
    expect(targets[0]).toBe("agent:working");
    expect(targets.at(-1)).toBe("agent:needs-you");
    expect(e.github.comments.length).toBeGreaterThanOrEqual(3);
    expect(e.github.comments.at(-1)?.body).toContain("Stage: `pr-review`");
  });

  it("makes no GitHub write when write-back is off", async () => {
    const e = await open({ steps: [planStep()], noWriteback: true });
    await e.pipeline.start(ISSUE, { override: false });
    expect(e.github.labelEdits).toEqual([]);
    expect(e.github.comments).toEqual([]);
  });

  it("never fails a stage because write-back fails", async () => {
    const e = await open({
      steps: [planStep()],
      github: { failLabels: true, failComments: true }
    });
    const result = await e.pipeline.start(ISSUE, { override: false });
    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    expect(
      e.events.some((event) => event.type === "log" && /write-back|skipped/.test(event.message))
    ).toBe(true);
  });
});

describe("pipeline runner: setup", () => {
  it("names a fix branch for an issue with the bug label", async () => {
    const e = await open({
      steps: [planStep()],
      github: { snapshot: snapshotOf({ labels: ["ready-for-agent", "bug"] }) }
    });
    await e.pipeline.start(ISSUE, { override: false });
    expect((await stateOf(e)).branch).toBe("KAINE-7-fix-export-reports");
  });

  it("puts the worktree next to the repository when worktreesDir is null", async () => {
    const e = await open({ steps: [planStep()], config: { worktreesDir: null } });
    await e.pipeline.start(ISSUE, { override: false });
    expect((await stateOf(e)).worktreePath).toBe(`${e.repoRoot}.worktrees/KAINE-7`);
  });

  it("copies configured files into the worktree and never overwrites one", async () => {
    const e = await open({
      steps: [planStep()],
      config: { copyIntoWorktree: ["local.env", "tracked.txt"] },
      extraFiles: { "tracked.txt": "from git\n" }
    });
    await writeFile(path.join(e.repoRoot, "local.env"), "SECRET=1\n");
    await writeFile(path.join(e.repoRoot, "tracked.txt"), "edited locally\n");
    await e.pipeline.start(ISSUE, { override: false });
    expect(await readFile(path.join(e.worktree(), "local.env"), "utf8")).toBe("SECRET=1\n");
    expect(await readFile(path.join(e.worktree(), "tracked.txt"), "utf8")).toBe("from git\n");
  });

  it("runs the setup recipe with the skills and providers of the roles", async () => {
    const e = await open({ steps: [planStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    const install = e.pnpm.calls.find((call) => call.argv[1] === "ai:install");
    expect(install?.argv).toEqual([
      "pnpm",
      "ai:install",
      "--agent",
      "claude",
      "--agent",
      "codex",
      "--non-interactive",
      "--skill",
      "kaine-review,kaine-test,kaine-write-plan",
      "--mcp",
      "serena"
    ]);
  });
});

describe("pipeline runner: plan gate", () => {
  it("sends feedback to the planner in the same session and returns to the gate", async () => {
    const e = await open({
      steps: [
        planStep(planOutput({ openQuestions: ["CSV or XLSX?"] })),
        planStep(planOutput({ summary: "Add a CSV export, no XLSX" }))
      ]
    });
    const first = await e.pipeline.start(ISSUE, { override: false });
    expect(first.outcome === "stopped" && first.message).toContain("- CSV or XLSX?");
    const session = (await stateOf(e)).sessions.planner;

    const result = await e.pipeline.feedback(ISSUE, "plan", "CSV only, please.");
    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    const state = await stateOf(e);
    expect(state.stage).toBe("plan-gate");
    expect(state.pendingFeedback).toBeNull();
    expect(JSON.parse(await artifact(e, "plan.json"))).toMatchObject({
      summary: "Add a CSV export, no XLSX"
    });
    expect(await artifact(e, "feedback.md")).toContain("CSV only, please.");

    const [, second] = e.runner.requests;
    expect(second?.resumeSessionId).toBe(session);
    expect(second?.prompt).toContain("CSV only, please.");
    expect(second?.prompt).toContain("Your previous plan:");
  });

  it("renames the branch when the planner picks another type or slug", async () => {
    const e = await open({
      steps: [
        planStep(planOutput({ pr: { type: "fix", slug: "csv-export" } })),
        buildStep(),
        reviewStep()
      ]
    });
    await e.pipeline.start(ISSUE, { override: false });
    await e.pipeline.approvePlan(ISSUE);

    const state = await stateOf(e);
    expect(state.branch).toBe("KAINE-7-fix-csv-export");
    expect(await e.deps.git.currentBranch(e.worktree())).toBe("KAINE-7-fix-csv-export");
    expect(await events(e)).toContain("plan-gate:branch-renamed");
  });

  it("keeps the provisional branch when the planner's name already exists", async () => {
    const e = await open({
      steps: [
        planStep(planOutput({ pr: { type: "fix", slug: "taken" } })),
        buildStep(),
        reviewStep()
      ]
    });
    e.fake?.addBranch("KAINE-7-fix-taken");
    await e.pipeline.start(ISSUE, { override: false });
    await e.pipeline.approvePlan(ISSUE);
    expect((await stateOf(e)).branch).toBe("KAINE-7-feat-export-reports");
    expect(await events(e)).toContain("plan-gate:branch-rename-skipped");
  });

  it("keeps the provisional branch when it may be pushed", async () => {
    const e = await open({
      steps: [
        planStep(planOutput({ pr: { type: "fix", slug: "csv-export" } })),
        buildStep(),
        reviewStep()
      ]
    });
    await e.pipeline.start(ISSUE, { override: false });
    // A remote-tracking ref for the branch means a push may have happened.
    e.fake?.addRef(e.worktree(), "refs/remotes/origin/KAINE-7-feat-export-reports");
    await e.pipeline.approvePlan(ISSUE);
    expect((await stateOf(e)).branch).toBe("KAINE-7-feat-export-reports");
    expect(await events(e)).toContain("plan-gate:branch-rename-skipped");
  });

  it("rejects approval outside the plan gate and changes nothing", async () => {
    const e = await open({ steps: [planStep(), buildStep(), reviewStep()] });
    expect(await e.pipeline.approvePlan(ISSUE)).toMatchObject({
      outcome: "refused",
      refusal: "unknown-issue"
    });
    await e.pipeline.start(ISSUE, { override: false });
    await e.pipeline.approvePlan(ISSUE);
    const before = await stateOf(e);
    const again = await e.pipeline.approvePlan(ISSUE);
    expect(again).toMatchObject({ outcome: "refused", refusal: "invalid-transition" });
    expect(await stateOf(e)).toEqual(before);
  });

  it("refuses feedback to build at the plan gate", async () => {
    const e = await open({ steps: [planStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    const before = await stateOf(e);
    expect(await e.pipeline.feedback(ISSUE, "build", "Skip the plan.")).toMatchObject({
      outcome: "refused",
      refusal: "invalid-transition"
    });
    expect(await stateOf(e)).toEqual(before);
  });

  it("refuses approval when plan.json is gone and changes nothing", async () => {
    const e = await open({ steps: [planStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    await rm(path.join(e.store.artifactsDir(ISSUE), "plan.json"));
    const before = await stateOf(e);
    const result = await e.pipeline.approvePlan(ISSUE);
    expect(result).toMatchObject({ outcome: "refused", refusal: "invalid-transition" });
    expect(result.outcome === "refused" && result.reason).toContain("plan.json is missing");
    expect(await stateOf(e)).toEqual(before);
  });

  it("streams state, history and agent events to a listener", async () => {
    const e = await open({ steps: [planStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    const types = new Set(e.events.map((event) => event.type));
    expect([...types]).toEqual(expect.arrayContaining(["agent", "history", "state"]));
    expect(
      e.events.some((event) => event.type === "agent" && event.event.type === "tool_call")
    ).toBe(true);
  });

  it("refuses an empty feedback text", async () => {
    const e = await open({ steps: [planStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    const before = await stateOf(e);
    expect(await e.pipeline.feedback(ISSUE, "plan", "   ")).toMatchObject({
      outcome: "refused",
      refusal: "invalid-transition"
    });
    expect(await stateOf(e)).toEqual(before);
  });
});
