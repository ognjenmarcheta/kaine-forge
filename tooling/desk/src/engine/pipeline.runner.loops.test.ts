import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IssueState, ReviewFinding } from "../contracts";
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

const planStep = (): ScriptedStep => ({ role: "planner", output: planOutput() });
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
const historyOf = async (e: PipelineEnv): Promise<string[]> =>
  (await stateOf(e)).history.map((entry) => `${entry.stage}:${entry.event}`);
const reasonOf = async (e: PipelineEnv): Promise<string> =>
  (await stateOf(e)).history.filter((entry) => entry.stage === "needs-you").at(-1)?.note ?? "";

const FAIL_A = { code: 1, stdout: "FAIL a.test.ts: expected 1 received 2\n" };
const FAIL_B = { code: 1, stdout: "error TS2322: type mismatch in b.ts\n" };

/** Start the issue and approve the plan, so the next step is build. */
const toBuild = async (e: PipelineEnv) => {
  await e.pipeline.start(ISSUE, { override: false });
  return e.pipeline.approvePlan(ISSUE);
};

const critical = (over: Partial<ReviewFinding> = {}): ReviewFinding => ({
  severity: "Critical",
  blocking: true,
  file: FEATURE_FILE,
  line: 1,
  section: "Correctness",
  summary: "The export drops the header row",
  fix: "Add the header row",
  ...over
});

describe("check loop", () => {
  it("sends the failure tail to the builder, two rounds, then passes", async () => {
    const e = await open({
      steps: [planStep(), buildStep(), buildStep(), buildStep(), reviewStep()]
    });
    e.pnpm.checkReplies.push(FAIL_A, FAIL_B);

    const result = await toBuild(e);
    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    const state = await stateOf(e);
    expect(state).toMatchObject({ stage: "pr-review", loops: { check: 2, review: 0 } });
    expect((await historyOf(e)).filter((entry) => entry === "check:check-failed")).toHaveLength(2);

    const builders = e.runner.requests.filter((request) => request.role === "builder");
    expect(builders).toHaveLength(3);
    expect(builders[0]?.prompt).not.toContain("FAIL a.test.ts");
    expect(builders[1]?.prompt).toContain("FAIL a.test.ts: expected 1 received 2");
    expect(builders[1]?.prompt).toContain("<<<BEGIN UNTRUSTED ISSUE DATA>>>");
    expect(builders[2]?.prompt).toContain("error TS2322");
    expect(builders[2]?.prompt).not.toContain("FAIL a.test.ts");
    // The builder session is resumed.
    expect(builders[1]?.resumeSessionId).toBe(state.sessions.builder);
    expect(state.pendingFeedback).toBeNull();
  });

  it("stops early when the same failure comes back", async () => {
    const e = await open({ steps: [planStep(), buildStep(), buildStep(), buildStep()] });
    e.pnpm.checkReplies.push(FAIL_A, FAIL_A);

    const result = await toBuild(e);
    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    const state = await stateOf(e);
    expect(state).toMatchObject({ stage: "needs-you", resumeStage: "check" });
    expect(await reasonOf(e)).toContain("same check failure came back");
    // One fix attempt, not three.
    expect(e.runner.requests.filter((request) => request.role === "builder")).toHaveLength(2);
    expect(e.notifications.at(-1)).toMatchObject({ stage: "needs-you", kind: "needs-you" });
  });

  it("stops at the loop limit with a precise reason", async () => {
    const e = await open({
      steps: [planStep(), buildStep(), buildStep()],
      config: { maxTestLoops: 1 }
    });
    e.pnpm.checkReplies.push(FAIL_A, FAIL_B);

    const result = await toBuild(e);
    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    expect(await reasonOf(e)).toContain("still fail after 1 fix round(s)");
    expect(await stateOf(e)).toMatchObject({ resumeStage: "check", loops: { check: 1 } });
  });

  it("keeps the report of the failed run and reruns only the check after continue", async () => {
    const e = await open({
      steps: [planStep(), buildStep(), reviewStep()],
      config: { maxTestLoops: 0 }
    });
    e.pnpm.checkReplies.push(FAIL_A);
    await toBuild(e);
    const report = JSON.parse(
      await readFile(path.join(e.store.artifactsDir(ISSUE), "check-report.json"), "utf8")
    ) as { passed: boolean };
    expect(report.passed).toBe(false);
    expect(await stateOf(e)).toMatchObject({ stage: "needs-you", resumeStage: "check" });

    // The engineer fixed it by hand. Continue reruns the check, not the builder.
    const again = await e.pipeline.continueFrom(ISSUE);
    expect(again).toMatchObject({ outcome: "stopped", stop: "gate" });
    expect(e.runner.requests.map((request) => request.role)).toEqual([
      "planner",
      "builder",
      "reviewer"
    ]);
  });
});

describe("review loop", () => {
  it("sends blocking findings to the builder, then approves", async () => {
    const e = await open({
      steps: [
        planStep(),
        buildStep(),
        reviewStep(
          reviewOutput({ verdict: "changes-requested", findings: [critical({ line: 2 })] })
        ),
        buildStep(),
        reviewStep()
      ]
    });

    const result = await toBuild(e);
    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    expect(await stateOf(e)).toMatchObject({ stage: "pr-review", loops: { review: 1 } });
    const builders = e.runner.requests.filter((request) => request.role === "builder");
    expect(builders[1]?.prompt).toContain("src/feature.ts:2");
    expect(builders[1]?.prompt).toContain("The export drops the header row");
    expect(builders[1]?.prompt).toContain("Suggested fix: Add the header row");
    // A fresh reviewer each round.
    const reviewers = e.runner.requests.filter((request) => request.role === "reviewer");
    expect(reviewers).toHaveLength(2);
    expect(reviewers.every((request) => request.resumeSessionId === undefined)).toBe(true);
  });

  it("stops at the review loop limit", async () => {
    const changes = reviewOutput({ verdict: "changes-requested", findings: [critical()] });
    const e = await open({
      steps: [planStep(), buildStep(), reviewStep(changes), buildStep(), reviewStep(changes)],
      config: { maxReviewLoops: 1 }
    });
    const result = await toBuild(e);
    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    expect(await reasonOf(e)).toContain("reviewer still asks for changes after 1 round(s)");
  });

  it("drops a non-blocking finding outside the diff and keeps the approval", async () => {
    const nit: ReviewFinding = critical({
      severity: "Nit",
      blocking: false,
      file: "src/other.ts",
      line: 4
    });
    const e = await open({
      steps: [planStep(), buildStep(), reviewStep(reviewOutput({ findings: [nit] }))]
    });
    const result = await toBuild(e);
    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    const review = JSON.parse(
      await readFile(path.join(e.store.artifactsDir(ISSUE), "review.json"), "utf8")
    ) as { rejected: { reason: string }[] };
    expect(review.rejected).toHaveLength(1);
    expect(review.rejected[0]?.reason).toContain("not a changed file");
    expect((await historyOf(e)).at(-1)).toBe("review:review-approved");
  });

  it("stops when a blocking finding points outside the diff", async () => {
    const e = await open({
      steps: [
        planStep(),
        buildStep(),
        reviewStep(
          reviewOutput({
            verdict: "changes-requested",
            findings: [critical({ file: "src/other.ts", line: 9 })]
          })
        )
      ]
    });
    const result = await toBuild(e);
    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    expect(await reasonOf(e)).toContain("blocking findings outside the diff");
    expect(await stateOf(e)).toMatchObject({ resumeStage: "review", loops: { review: 0 } });
  });

  it("asks for changes when the verdict says so even without a blocking finding", async () => {
    const e = await open({
      steps: [
        planStep(),
        buildStep(),
        reviewStep(
          reviewOutput({
            verdict: "changes-requested",
            findings: [critical({ severity: "Consider", blocking: false })]
          })
        ),
        buildStep(),
        reviewStep()
      ]
    });
    await toBuild(e);
    expect(await stateOf(e)).toMatchObject({ stage: "pr-review", loops: { review: 1 } });
  });

  it("sends pr-review feedback to the builder with fresh loop budgets", async () => {
    const e = await open({
      steps: [planStep(), buildStep(), reviewStep(), buildStep(), reviewStep()]
    });
    await toBuild(e);
    const result = await e.pipeline.feedback(ISSUE, "build", "Rename the function to csv.");
    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    const builders = e.runner.requests.filter((request) => request.role === "builder");
    expect(builders[1]?.prompt).toContain("Rename the function to csv.");
    expect(await stateOf(e)).toMatchObject({ stage: "pr-review", loops: { check: 0, review: 0 } });
  });

  it("sends pr-review feedback to a fresh review", async () => {
    const e = await open({ steps: [planStep(), buildStep(), reviewStep(), reviewStep()] });
    await toBuild(e);
    const result = await e.pipeline.feedback(ISSUE, "review", "Look at the CSV quoting.");
    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    const reviewers = e.runner.requests.filter((request) => request.role === "reviewer");
    expect(reviewers[1]?.prompt).toContain("Look at the CSV quoting.");
  });
});

describe("builder blockers and continue", () => {
  it("stops on builder blockers and resumes the same session after feedback", async () => {
    const e = await open({
      steps: [
        planStep(),
        buildStep({ output: builderOutput({ blockers: ["The schema is missing"] }) }),
        buildStep(),
        reviewStep()
      ]
    });
    const stopped = await toBuild(e);
    expect(stopped).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    expect(stopped.outcome === "stopped" && stopped.message).toContain("- The schema is missing");
    const blocked = await stateOf(e);
    expect(blocked).toMatchObject({ stage: "needs-you", resumeStage: "build" });
    expect(blocked.sessions.builder).toBeDefined();

    const result = await e.pipeline.feedback(ISSUE, "build", "Use schema v2.");
    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    const builders = e.runner.requests.filter((request) => request.role === "builder");
    expect(builders[1]?.resumeSessionId).toBe(blocked.sessions.builder);
    expect(builders[1]?.prompt).toContain("Use schema v2.");
  });

  it("stops when the builder changes nothing", async () => {
    const e = await open({ steps: [planStep(), buildStep({ effect: () => undefined })] });
    const result = await toBuild(e);
    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    expect(await reasonOf(e)).toContain("changed no file");
  });

  it("retries a failed setup from needs-you with continue", async () => {
    const e = await open({ steps: [planStep()] });
    e.pnpm.scriptReplies.set("install", { code: 1, stderr: "ERR_PNPM_FETCH" });
    const first = await e.pipeline.start(ISSUE, { override: false });
    expect(first).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    expect(first.outcome === "stopped" && first.message).toContain(
      "Setup failed at step 'install'"
    );
    expect(await stateOf(e)).toMatchObject({ resumeStage: "setup", status: "waiting" });

    e.pnpm.scriptReplies.clear();
    const second = await e.pipeline.continueFrom(ISSUE);
    expect(second).toMatchObject({ outcome: "stopped", stop: "gate" });
    expect((await stateOf(e)).stage).toBe("plan-gate");
    expect(await historyOf(e)).toContain("needs-you:continued");
  });

  it("continues from a stage the engineer names", async () => {
    const e = await open({ steps: [planStep(), planStep()] });
    e.pnpm.scriptReplies.set("env:ensure", { code: 1, stderr: "boom" });
    await e.pipeline.start(ISSUE, { override: false });
    e.pnpm.scriptReplies.clear();
    const result = await e.pipeline.continueFrom(ISSUE, "setup");
    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
  });

  it("refuses to continue outside needs-you and changes nothing", async () => {
    const e = await open({ steps: [planStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    expect(await e.pipeline.continueFrom(ISSUE)).toMatchObject({
      outcome: "refused",
      refusal: "invalid-transition"
    });
    expect((await stateOf(e)).stage).toBe("plan-gate");
  });
});
