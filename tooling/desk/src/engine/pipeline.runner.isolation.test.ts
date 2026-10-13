import { afterEach, describe, expect, it, vi } from "vitest";

import { runChecks } from "../check";
import type { IssueState } from "../contracts";
import type {
  IsolatedCheckRequest,
  IsolatedStage,
  IsolationPort
} from "../isolation/isolation.port";
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

interface StubDocker extends IsolationPort {
  readonly stages: IsolatedStage[];
  readonly checks: IsolatedCheckRequest[];
  readonly removed: number[];
  readonly containersRemoved: number[];
  preflightReply: string | null;
  removeFails: boolean;
}

/**
 * A Docker port that records what the engine asks of it and answers with the host
 * behaviour. It proves the routing, not Docker itself: that is the job of the
 * isolation tests and the gated integration test.
 */
const stubDocker = (runner: PipelineEnv["runner"]): StubDocker => {
  const stub: StubDocker = {
    mode: "docker",
    stages: [],
    checks: [],
    removed: [],
    containersRemoved: [],
    preflightReply: null,
    removeFails: false,
    preflight: () => Promise.resolve(stub.preflightReply),
    runnerFor: (stage) => {
      stub.stages.push(stage);
      return runner;
    },
    runChecks: (request) => {
      stub.checks.push(request);
      return runChecks(request);
    },
    removeContainers: (issue) => {
      stub.containersRemoved.push(issue);
      return Promise.resolve(`Removed leftover containers of #${issue}.`);
    },
    removeIssue: (issue) => {
      if (stub.removeFails) return Promise.reject(new Error("the daemon said no"));
      stub.removed.push(issue);
      return Promise.resolve(`Removed the resources of #${issue}.`);
    }
  };
  return stub;
};

const planStep = (): ScriptedStep => ({ role: "planner", output: planOutput() });
const buildStep = (): ScriptedStep => ({
  role: "builder",
  output: builderOutput(),
  effect: (run) => writeFeature(run)
});
const reviewStep = (): ScriptedStep => ({ role: "reviewer", output: reviewOutput() });
const steps = [planStep(), buildStep(), reviewStep()];

/** The environment needs the stub before it exists, so the stub reads the runner lazily. */
const open = async (
  options: EnvOptions = {},
  withDocker = true
): Promise<{ e: PipelineEnv; docker: StubDocker }> => {
  const holder: { runner: PipelineEnv["runner"] | null } = { runner: null };
  const docker = stubDocker({
    requests: [],
    remaining: () => 0,
    maxActive: () => 0,
    active: () => 0,
    run: (request) => {
      if (holder.runner === null) throw new Error("runner not ready");
      return holder.runner.run(request);
    }
  });
  const e = await createPipelineEnv({ steps, ...options, ...(withDocker ? { docker } : {}) });
  holder.runner = e.runner;
  env = e;
  return { e, docker };
};

const stateOf = async (e: PipelineEnv): Promise<IssueState> => {
  const read = await e.store.read(ISSUE);
  if (read.status !== "ok") throw new Error(`state is ${read.status}`);
  return read.state;
};

describe("per-issue isolation", () => {
  it("records the choice made at start and uses the Docker port for every agent stage and the checks", async () => {
    const { e, docker } = await open();
    const first = await e.pipeline.start(ISSUE, { override: false, isolation: "docker" });
    expect(first).toMatchObject({ outcome: "stopped", stop: "gate" });
    expect((await stateOf(e)).isolation).toBe("docker");

    await e.pipeline.approvePlan(ISSUE);
    expect((await stateOf(e)).stage).toBe("pr-review");

    expect(docker.stages.map((stage) => stage.role)).toEqual(["planner", "builder", "reviewer"]);
    const builder = docker.stages[1];
    expect(builder).toMatchObject({
      issue: ISSUE,
      worktree: e.worktree(),
      provider: "claude"
    });
    expect(builder?.baseSha).toMatch(/^[0-9a-f]{40}$/);
    expect(builder?.artifactsDir).toBe(e.store.artifactsDir(ISSUE));
    expect(docker.checks).toHaveLength(1);
    expect(docker.checks[0]).toMatchObject({ issue: ISSUE, kind: "loop", worktree: e.worktree() });
  });

  it("keeps the choice for later calls, so approve needs no flag", async () => {
    const { e, docker } = await open({ config: { isolation: "host" } });
    await e.pipeline.start(ISSUE, { override: false, isolation: "docker" });
    await e.pipeline.approvePlan(ISSUE);
    expect(docker.stages.length).toBe(3);
  });

  it("uses the config default when the issue has no choice", async () => {
    const { e, docker } = await open({ config: { isolation: "docker" } });
    await e.pipeline.start(ISSUE, { override: false });
    expect((await stateOf(e)).isolation).toBeUndefined();
    expect(docker.stages.map((stage) => stage.role)).toEqual(["planner"]);
  });

  it("lets an issue choose host although the config says docker", async () => {
    const { e, docker } = await open({ config: { isolation: "docker" } });
    await e.pipeline.start(ISSUE, { override: false, isolation: "host" });
    await e.pipeline.approvePlan(ISSUE);
    expect(docker.stages).toEqual([]);
    expect(docker.checks).toEqual([]);
    expect((await stateOf(e)).stage).toBe("pr-review");
  });

  it("does not call the Docker port for a host issue", async () => {
    const { e, docker } = await open();
    await e.pipeline.start(ISSUE, { override: false });
    await e.pipeline.approvePlan(ISSUE);
    expect(docker.stages).toEqual([]);
    expect(docker.checks).toEqual([]);
    expect(docker.removed).toEqual([]);
  });

  it("refuses to start when Docker is not usable, and creates no state", async () => {
    const { e, docker } = await open();
    docker.preflightReply =
      "The worker image kaine-desk-worker:abc is missing. Run 'pnpm desk docker build', then continue.";
    const result = await e.pipeline.start(ISSUE, { override: false, isolation: "docker" });
    expect(result).toMatchObject({ outcome: "refused", refusal: "intake-refused" });
    expect(result.outcome === "refused" ? result.reason : "").toContain("pnpm desk docker build");
    expect((await e.store.read(ISSUE)).status).toBe("missing");
  });

  it("refuses a Docker start when this process has no Docker support", async () => {
    const { e } = await open({}, false);
    const result = await e.pipeline.start(ISSUE, { override: false, isolation: "docker" });
    expect(result).toMatchObject({ outcome: "refused", refusal: "intake-refused" });
    expect(result.outcome === "refused" ? result.reason : "").toContain("not wired");
  });

  it("sends an issue to needs-you when its mode is docker but the process lost Docker support", async () => {
    const { e } = await open({}, false);
    await e.pipeline.start(ISSUE, { override: false });
    // The issue was started with Docker by another process.
    await e.store.write({ ...(await stateOf(e)), isolation: "docker" });
    const result = await e.pipeline.approvePlan(ISSUE);
    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    expect(result.outcome === "stopped" ? result.message : "").toContain(
      "Docker isolation is requested"
    );
  });
});

describe("remove and recovery with Docker", () => {
  it("removes the Docker resources before the state, and verifies", async () => {
    const { e, docker } = await open();
    await e.pipeline.start(ISSUE, { override: false, isolation: "docker" });
    const result = await e.pipeline.remove(ISSUE, { force: true });
    expect(result.outcome).toBe("removed");
    expect(docker.removed).toEqual([ISSUE]);
    expect((await e.store.read(ISSUE)).status).toBe("missing");
  });

  it("refuses to remove when the Docker cleanup cannot be verified, and keeps the state", async () => {
    const { e, docker } = await open();
    await e.pipeline.start(ISSUE, { override: false, isolation: "docker" });
    docker.removeFails = true;
    const result = await e.pipeline.remove(ISSUE, { force: false });
    expect(result).toMatchObject({ outcome: "refused", refusal: "remove-failed" });
    expect(result.outcome === "refused" ? result.reason : "").toContain(
      "pnpm desk docker prune --issue 7"
    );
    expect((await e.store.read(ISSUE)).status).toBe("ok");
  });

  it("removes the state with force even when the Docker cleanup fails, and says how to finish", async () => {
    const { e, docker } = await open();
    await e.pipeline.start(ISSUE, { override: false, isolation: "docker" });
    docker.removeFails = true;
    const result = await e.pipeline.remove(ISSUE, { force: true });
    expect(result.outcome).toBe("removed");
    expect(
      e.events.some(
        (event) =>
          event.type === "log" && event.message.includes("pnpm desk docker prune --issue 7")
      )
    ).toBe(true);
  });

  it("removes leftover containers when a cancelled issue is stopped", async () => {
    const { e, docker } = await open();
    await e.pipeline.start(ISSUE, { override: false, isolation: "docker" });
    const result = await e.pipeline.cancel(ISSUE);
    expect(result).toMatchObject({ outcome: "stopped", stop: "cancelled" });
    expect(docker.containersRemoved).toContain(ISSUE);
  });

  it("does not touch Docker when a host issue is removed", async () => {
    const { e, docker } = await open();
    await e.pipeline.start(ISSUE, { override: false });
    await e.pipeline.remove(ISSUE, { force: true });
    expect(docker.removed).toEqual([]);
    expect(docker.containersRemoved).toEqual([]);
  });
});
