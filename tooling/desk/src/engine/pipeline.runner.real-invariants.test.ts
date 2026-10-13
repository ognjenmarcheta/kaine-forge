import { afterEach, describe, expect, it, vi } from "vitest";

import type { IssueState } from "../contracts";
import {
  ISSUE,
  builderOutput,
  createPipelineEnv,
  planOutput,
  writeFeature,
  type PipelineEnv
} from "../testing/pipeline.testing";

/**
 * The same engine against a real git origin, clone and worktree. Process starts
 * are slow on some machines, so only the paths that need real git live here.
 */

vi.setConfig({ testTimeout: 60_000 });

let env: PipelineEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

const stateOf = async (e: PipelineEnv): Promise<IssueState> => {
  const read = await e.store.read(ISSUE);
  if (read.status !== "ok") throw new Error(`state is ${read.status}`);
  return read.state;
};

const reasonOf = async (e: PipelineEnv): Promise<string> =>
  (await stateOf(e)).history.filter((entry) => entry.stage === "needs-you").at(-1)?.note ?? "";

describe("engine invariants with real git", () => {
  it("stops a builder that committed and tagged", async () => {
    env = await createPipelineEnv({
      git: "real",
      steps: [
        { role: "planner", output: planOutput() },
        {
          role: "builder",
          output: builderOutput(),
          effect: async (run) => {
            await writeFeature(run);
            const clone = env?.clone;
            await clone?.git(["add", "-A"], run.cwd);
            await clone?.git(["commit", "--quiet", "-m", "agent commit"], run.cwd);
            await clone?.git(["tag", "agent-tag"], run.cwd);
          }
        }
      ]
    });
    await env.pipeline.start(ISSUE, { override: false });
    await env.pipeline.approvePlan(ISSUE);
    const reason = await reasonOf(env);
    expect(reason).toContain("head-moved at HEAD");
    expect(reason).toContain("ref-added at refs/tags/agent-tag");
    expect(await stateOf(env)).toMatchObject({ stage: "needs-you", resumeStage: "build" });
  });
});

describe("read-only roles with real git", () => {
  it("stops a planner that edited a file", async () => {
    env = await createPipelineEnv({
      git: "real",
      steps: [{ role: "planner", output: planOutput(), effect: (run) => writeFeature(run) }]
    });
    await env.pipeline.start(ISSUE, { override: false });
    expect(await reasonOf(env)).toContain("planner is read-only, but the worktree diff changed");
    expect(await stateOf(env)).toMatchObject({ stage: "needs-you", resumeStage: "plan" });
  });
});
