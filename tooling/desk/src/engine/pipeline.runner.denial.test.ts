import { afterEach, describe, expect, it, vi } from "vitest";

import type { IssueState } from "../contracts";
import { deniedCommands } from "./pipeline.denials";
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

const COMMAND = "pnpm turbo run lint --filter=@repo/web --dry=json";

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
const blockedBuild = (command: string = COMMAND): ScriptedStep => ({
  role: "builder",
  output: builderOutput({ blockers: [`Bash permission denied for \`${command}\``] }),
  denials: [{ tool: "Bash", command, paths: [] }]
});
const goodBuild = (): ScriptedStep => ({
  role: "builder",
  output: builderOutput(),
  effect: (run) => writeFeature(run)
});
const reviewStep = (): ScriptedStep => ({ role: "reviewer", output: reviewOutput() });

const stateOf = async (e: PipelineEnv): Promise<IssueState> => {
  const read = await e.store.read(ISSUE);
  if (read.status !== "ok") throw new Error(`state is ${read.status}`);
  return read.state;
};

/** The issue stopped at build because the builder was refused `command`. */
const stoppedByDenial = async (e: PipelineEnv): Promise<void> => {
  await e.pipeline.start(ISSUE, { override: false });
  await e.pipeline.approvePlan(ISSUE);
  expect(await stateOf(e)).toMatchObject({ stage: "needs-you", resumeStage: "build" });
};

describe("a stop caused by a refused command", () => {
  it("lists the refused command of the stage to retry, and nothing for a command no owner may allow", async () => {
    const e = await open({ steps: [planStep(), blockedBuild()] });
    await stoppedByDenial(e);
    const state = await stateOf(e);
    expect(await deniedCommands(e.store.artifactsDir(ISSUE), state)).toEqual([COMMAND]);

    const other = await open({ steps: [planStep(), blockedBuild("pnpm exec evil")] });
    await stoppedByDenial(other);
    expect(await deniedCommands(other.store.artifactsDir(ISSUE), await stateOf(other))).toEqual([]);
  });

  it("allow keeps the exact command, retries the stage, and runs it with that one rule", async () => {
    const e = await open({ steps: [planStep(), blockedBuild(), goodBuild(), reviewStep()] });
    await stoppedByDenial(e);

    const result = await e.pipeline.resolveDenial(ISSUE, COMMAND, "allow");

    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    expect(await stateOf(e)).toMatchObject({ approvedCommands: [COMMAND] });
    const builders = e.runner.requests.filter((request) => request.role === "builder");
    expect(builders[0]?.permissions.allow).not.toContain(`Bash(${COMMAND})`);
    expect(builders[1]?.permissions.allow).toContain(`Bash(${COMMAND})`);
    expect(builders[1]?.permissions.allow).not.toContain(`Bash(${COMMAND}:*)`);
  });

  it("skip sends the agent a note to leave the command out, and allows nothing", async () => {
    const e = await open({ steps: [planStep(), blockedBuild(), goodBuild(), reviewStep()] });
    await stoppedByDenial(e);

    const result = await e.pipeline.resolveDenial(ISSUE, COMMAND, "skip");

    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    expect((await stateOf(e)).approvedCommands).toBeUndefined();
    const builders = e.runner.requests.filter((request) => request.role === "builder");
    expect(builders[1]?.prompt).toContain(`\`${COMMAND}\``);
    expect(builders[1]?.prompt).toContain("not-run");
    expect(builders[1]?.permissions.allow).not.toContain(`Bash(${COMMAND})`);
  });

  it.each(["allow", "skip"] as const)(
    "%s refuses a command the desk never refused, and changes nothing",
    async (resolution) => {
      const e = await open({ steps: [planStep(), blockedBuild()] });
      await stoppedByDenial(e);
      const before = await stateOf(e);

      const result = await e.pipeline.resolveDenial(ISSUE, "pnpm turbo run lint", resolution);

      expect(result).toMatchObject({ outcome: "refused", refusal: "invalid-transition" });
      expect(await stateOf(e)).toEqual(before);
    }
  );

  it("refuses an issue that is not stopped", async () => {
    const e = await open({ steps: [planStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    const result = await e.pipeline.resolveDenial(ISSUE, COMMAND, "allow");
    expect(result).toMatchObject({ outcome: "refused" });
  });
});
