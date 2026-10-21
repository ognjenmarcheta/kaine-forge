import { afterEach, describe, expect, it, vi } from "vitest";

import type { IssueState } from "../contracts";
import {
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

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const planStep = (): ScriptedStep => ({ role: "planner", output: planOutput() });
const buildStep = (over: Partial<ScriptedStep> = {}): ScriptedStep => ({
  role: "builder",
  output: builderOutput(),
  effect: (run) => writeFeature(run),
  ...over
});
const reviewStep = (): ScriptedStep => ({ role: "reviewer", output: reviewOutput() });

const stateOf = async (e: PipelineEnv): Promise<IssueState> => {
  const read = await e.store.read(ISSUE);
  if (read.status !== "ok") throw new Error(`state is ${read.status}`);
  return read.state;
};

const roles = (e: PipelineEnv): string[] => e.runner.requests.map((request) => request.role);
const checksRun = (e: PipelineEnv): number =>
  e.pnpm.calls.filter((call) => call.argv[1] === "check:affected").length;

describe("pause and resume", () => {
  it("lets the running stage end, starts no next stage, and resume runs on from there", async () => {
    const hold = deferred();
    const e = await open({ steps: [planStep(), buildStep({ hold: hold.promise }), reviewStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    const approving = e.pipeline.approvePlan(ISSUE);
    await vi.waitFor(() => expect(e.runner.active()).toBe(1), { timeout: 20_000, interval: 10 });

    // The builder still runs: the pause answers at once instead of waiting behind it.
    expect(await e.pipeline.pause(ISSUE)).toMatchObject({
      outcome: "stopped",
      stop: "paused",
      message: "Pauses once 'build' ends."
    });
    hold.resolve();

    expect(await approving).toMatchObject({
      outcome: "stopped",
      stop: "paused",
      message: "Paused before 'check'. Resume to run it."
    });
    expect(await stateOf(e)).toMatchObject({
      stage: "check",
      status: "waiting",
      pauseRequested: true
    });
    expect(checksRun(e)).toBe(0);

    const resumed = await e.pipeline.resume(ISSUE);
    expect(resumed).toMatchObject({ outcome: "stopped", stop: "gate" });
    expect(await stateOf(e)).toMatchObject({
      stage: "pr-review",
      pauseRequested: false,
      pausedAt: null
    });
    expect(checksRun(e)).toBe(1);
    expect(roles(e)).toEqual(["planner", "builder", "reviewer"]);
  });

  it("keeps a pause set at a gate in the state, so no later action or desk starts the next stage", async () => {
    const e = await open({ steps: [planStep(), buildStep(), reviewStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    expect(await e.pipeline.pause(ISSUE)).toMatchObject({ stop: "paused" });

    expect(await e.pipeline.approvePlan(ISSUE)).toMatchObject({
      stop: "paused",
      state: { stage: "build", status: "waiting" }
    });
    // A desk started again reads the pause from the state file.
    const restarted = e.secondRunner();
    expect(await restarted.advance(ISSUE)).toMatchObject({ stop: "paused" });
    expect(roles(e)).toEqual(["planner"]);

    expect(await restarted.resume(ISSUE)).toMatchObject({ stop: "gate" });
    expect(roles(e)).toEqual(["planner", "builder", "reviewer"]);
  });

  it("refuses to resume an issue that is not paused, and to pause one that has ended", async () => {
    const e = await open({ steps: [planStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    expect(await e.pipeline.resume(ISSUE)).toMatchObject({
      outcome: "refused",
      refusal: "invalid-transition"
    });
    await e.pipeline.cancel(ISSUE);
    expect(await e.pipeline.pause(ISSUE)).toMatchObject({
      outcome: "refused",
      refusal: "invalid-transition"
    });
    expect((await stateOf(e)).pauseRequested).not.toBe(true);
  });
});
