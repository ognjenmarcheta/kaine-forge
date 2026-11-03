import { afterEach, describe, expect, it, vi } from "vitest";

import type { IssueState } from "../contracts";
import { readRunRecords } from "../stats/stats.runs";
import {
  ISSUE,
  builderOutput,
  createPipelineEnv,
  planOutput,
  reviewOutput,
  writeFeature,
  type PipelineEnv,
  type ScriptedStep
} from "../testing/pipeline.testing";

vi.setConfig({ testTimeout: 30_000 });

let env: PipelineEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

const open = async (steps: readonly ScriptedStep[]): Promise<PipelineEnv> => {
  env = await createPipelineEnv({ steps });
  return env;
};

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

/** A run that waits until the owner stops it. */
const never = new Promise<void>(() => undefined);

const planStep = (): ScriptedStep => ({ role: "planner", output: planOutput() });
const heldBuild: ScriptedStep = {
  role: "builder",
  output: builderOutput(),
  sessionId: "build-session",
  effect: (run) => writeFeature(run),
  hold: never
};
const buildStep = (): ScriptedStep => ({ role: "builder", output: builderOutput() });
const reviewStep = (over: Partial<ScriptedStep> = {}): ScriptedStep => ({
  role: "reviewer",
  output: reviewOutput(),
  ...over
});

const stateOf = async (e: PipelineEnv): Promise<IssueState> => {
  const read = await e.store.read(ISSUE);
  if (read.status !== "ok") throw new Error(`state is ${read.status}`);
  return read.state;
};

const events = async (e: PipelineEnv): Promise<string[]> =>
  (await stateOf(e)).history.map((entry) => entry.event);

/**
 * Start the issue, approve the plan, and wait until the given role runs. The approval is wrapped:
 * an async function that returned it would wait for it.
 */
const runningAt = async (
  e: PipelineEnv,
  role: string
): Promise<{ readonly approving: Promise<unknown> }> => {
  await e.pipeline.start(ISSUE, { override: false });
  const approving = e.pipeline.approvePlan(ISSUE);
  await vi.waitFor(() => expect(e.runner.requests.at(-1)?.role).toBe(role), {
    timeout: 20_000,
    interval: 10
  });
  await vi.waitFor(() => expect(e.runner.active()).toBe(1), { timeout: 20_000, interval: 10 });
  return { approving };
};

describe("steer", () => {
  it("resumes the running agent's session with the owner's note and counts both runs as one", async () => {
    const e = await open([planStep(), heldBuild, buildStep(), reviewStep()]);
    const { approving } = await runningAt(e, "builder");

    expect(await e.pipeline.steer(ISSUE, "  Reuse the CSV helper.  ")).toMatchObject({
      outcome: "stopped",
      stop: "steered",
      message: "The agent at 'build' goes on with your note."
    });
    expect(await approving).toMatchObject({ outcome: "stopped", stop: "gate" });

    expect(e.runner.requests.map((request) => request.role)).toEqual([
      "planner",
      "builder",
      "builder",
      "reviewer"
    ]);
    const resumed = e.runner.requests[2];
    expect(resumed?.resumeSessionId).toBe("build-session");
    expect(resumed?.prompt).toContain("## The owner's note");
    expect(resumed?.prompt).toContain("Reuse the CSV helper.");
    expect(await events(e)).toContain("steered");

    const { records } = await readRunRecords(e.stateRoot);
    expect(records.filter((record) => record.role === "builder")).toMatchObject([
      { accepted: true, steers: 1 }
    ]);
  });

  it("refuses when no agent of the issue runs, and changes nothing", async () => {
    const e = await open([planStep()]);
    await e.pipeline.start(ISSUE, { override: false });
    const before = await stateOf(e);

    expect(await e.pipeline.steer(ISSUE, "Reuse the CSV helper.")).toMatchObject({
      outcome: "refused",
      refusal: "invalid-transition"
    });
    expect(await e.pipeline.takeOver(ISSUE)).toMatchObject({
      outcome: "refused",
      refusal: "invalid-transition"
    });
    expect(await stateOf(e)).toEqual(before);
  });
});

describe("take over", () => {
  it("stops the builder at needs-you with its session, and continue resumes that session", async () => {
    const e = await open([planStep(), heldBuild, buildStep(), reviewStep()]);
    const { approving } = await runningAt(e, "builder");

    const taken = await e.pipeline.takeOver(ISSUE);
    expect(taken).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    // The reason reaches the GitHub status comment, so it names the command, not the session.
    const reason = taken.outcome === "stopped" ? taken.message : null;
    expect(reason).toContain(`pnpm desk resume ${ISSUE}`);
    expect(reason).not.toContain("build-session");
    expect(await approving).toMatchObject({ stop: "needs-you" });
    expect(await stateOf(e)).toMatchObject({
      stage: "needs-you",
      resumeStage: "build",
      sessions: { builder: "build-session" }
    });
    expect(await events(e)).toContain("taken-over");

    expect(await e.pipeline.continueFrom(ISSUE)).toMatchObject({ stop: "gate" });
    expect(e.runner.requests[2]).toMatchObject({
      role: "builder",
      resumeSessionId: "build-session"
    });
  });

  it("refuses for a reviewer, which starts a new session on each run", async () => {
    const hold = deferred();
    const e = await open([
      planStep(),
      { role: "builder", output: builderOutput(), effect: (run) => writeFeature(run) },
      reviewStep({ hold: hold.promise })
    ]);
    const { approving } = await runningAt(e, "reviewer");

    expect(await e.pipeline.takeOver(ISSUE)).toMatchObject({
      outcome: "refused",
      refusal: "invalid-transition"
    });
    hold.resolve();
    expect(await approving).toMatchObject({ stop: "gate" });
    expect(await events(e)).not.toContain("taken-over");
  });
});
