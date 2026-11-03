import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProviderPort } from "../agents/provider.probe";
import type { IssueState, Provider } from "../contracts";
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

const open = async (options: EnvOptions): Promise<PipelineEnv> => {
  env = await createPipelineEnv(options);
  return env;
};

/** A machine with these CLIs. `forget` drops one, as a spawn that found it missing does. */
const installed = (...providers: Provider[]): ProviderPort => {
  const usable = new Set(providers);
  return {
    usable: () => Promise.resolve(new Set(usable)),
    forget: (provider) => usable.delete(provider),
    allowCodexBuilder: () => false
  };
};

const STEPS: ScriptedStep[] = [
  { role: "planner", provider: "claude", output: planOutput() },
  {
    role: "builder",
    provider: "claude",
    output: builderOutput(),
    effect: (run) => writeFeature(run)
  },
  { role: "reviewer", provider: "claude", output: reviewOutput() }
];

const stateOf = async (e: PipelineEnv): Promise<IssueState> => {
  const read = await e.store.read(ISSUE);
  if (read.status !== "ok") throw new Error(`state is ${read.status}`);
  return read.state;
};

describe("pipeline runner: a provider that is not installed", () => {
  it("reviews on Claude when Codex is missing, says so in the history, and reaches pr-review", async () => {
    const e = await open({ steps: STEPS, providers: installed("claude") });
    await e.pipeline.start(ISSUE, { override: false });
    await e.pipeline.approvePlan(ISSUE);

    const state = await stateOf(e);
    expect(state).toMatchObject({ stage: "pr-review", status: "waiting" });
    expect(e.runner.requests.map((run) => `${run.role}:${run.provider}`)).toEqual([
      "planner:claude",
      "builder:claude",
      "reviewer:claude"
    ]);
    expect(state.history).toContainEqual(
      expect.objectContaining({
        stage: "review",
        event: "provider-moved",
        note: "The reviewer ran on claude: codex is not installed or does not work."
      })
    );
  });

  it("chooses again when the CLI the probe found does not start", async () => {
    const missing = {
      role: "reviewer",
      provider: "codex",
      failure: {
        kind: "process-error",
        message: "Cannot start codex: spawn codex ENOENT",
        exitCode: null,
        stderrTail: ""
      }
    } as const satisfies ScriptedStep;
    const e = await open({
      steps: [...STEPS.slice(0, 2), missing, STEPS[2]!],
      providers: installed("claude", "codex")
    });
    await e.pipeline.start(ISSUE, { override: false });
    await e.pipeline.approvePlan(ISSUE);

    expect(await stateOf(e)).toMatchObject({ stage: "pr-review", status: "waiting" });
    expect(e.runner.requests.slice(-2).map((run) => run.provider)).toEqual(["codex", "claude"]);
  });
});
