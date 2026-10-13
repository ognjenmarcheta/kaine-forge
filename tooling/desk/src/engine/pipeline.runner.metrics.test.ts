import { appendFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ROLE_SKILLS } from "./worktree.bootstrap";
import type { AgentEvent } from "../agents/agent.runner";
import { STUCK_LIMIT } from "../agents/agent.stuck";
import type { IssueState } from "../contracts";
import { readLessonRecords } from "../stats/stats.lessons";
import { readRunRecords } from "../stats/stats.runs";
import {
  FEATURE_FILE,
  ISSUE,
  builderOutput,
  createPipelineEnv,
  planOutput,
  reviewOutput,
  skillCalls,
  writeFeature,
  type EnvOptions,
  type PipelineEnv
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

const stateOf = async (e: PipelineEnv): Promise<IssueState> => {
  const read = await e.store.read(ISSUE);
  if (read.status !== "ok") throw new Error(`state is ${read.status}`);
  return read.state;
};

const failingTest = (index: number): AgentEvent[] => [
  {
    type: "tool_call",
    id: `t-${index}`,
    tool: "Bash",
    command: "pnpm --filter app test",
    paths: []
  },
  { type: "tool_result", id: `t-${index}`, isError: true, exitCode: 1, output: "1 failed" }
];

describe("stuck detection", () => {
  it("stops a builder that repeats a failing call and sends the issue to needs-you", async () => {
    const loop = Array.from({ length: STUCK_LIMIT }, (_, index) => failingTest(index)).flat();
    const e = await open({
      steps: [
        { role: "planner", output: planOutput() },
        {
          role: "builder",
          output: builderOutput(),
          effect: (run) => writeFeature(run),
          trace: [...skillCalls(ROLE_SKILLS.builder), ...loop]
        }
      ]
    });
    await e.pipeline.start(ISSUE, { override: false });

    const result = await e.pipeline.approvePlan(ISSUE);

    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    const state = await stateOf(e);
    expect(state).toMatchObject({ stage: "needs-you", resumeStage: "build", status: "waiting" });
    expect(state.history.at(-1)?.note).toMatch(/^The agent ran /);
    expect(state.history.at(-1)?.note).toContain(
      `ran \`pnpm --filter app test\` ${STUCK_LIMIT} times in a row`
    );
    const { records } = await readRunRecords(e.stateRoot);
    expect(records.at(-1)).toMatchObject({
      role: "builder",
      ok: false,
      accepted: false,
      failureKind: "stuck",
      failedToolCalls: STUCK_LIMIT
    });
    const lessons = await readLessonRecords(e.stateRoot);
    expect(lessons.records).toEqual([
      expect.objectContaining({
        role: "builder",
        source: "stuck",
        key: "stuck/pnpm --filter app test",
        count: 1
      })
    ]);
  });
});

describe("run records", () => {
  it("appends one record per agent run and keeps them after remove", async () => {
    const e = await open({
      config: { models: { builder: "opus" } },
      steps: [
        { role: "planner", output: planOutput() },
        {
          role: "builder",
          output: builderOutput(),
          effect: (run) => writeFeature(run),
          trace: [
            ...skillCalls(ROLE_SKILLS.builder),
            { type: "tool_call", id: "e1", tool: "Write", paths: ["src/feature.ts"] },
            { type: "tool_result", id: "e1", isError: false, output: "" }
          ]
        },
        { role: "reviewer", output: reviewOutput() }
      ]
    });
    await e.pipeline.start(ISSUE, { override: false });
    await e.pipeline.approvePlan(ISSUE);
    expect((await stateOf(e)).stage).toBe("pr-review");

    await e.pipeline.remove(ISSUE, { force: true });

    const { records, invalidLines } = await readRunRecords(e.stateRoot);
    expect(invalidLines).toBe(0);
    expect(
      records.map((record) => [record.issue, record.role, record.model, record.accepted])
    ).toEqual([
      [ISSUE, "planner", null, true],
      [ISSUE, "builder", "opus", true],
      [ISSUE, "reviewer", null, true]
    ]);
    expect(records[1]).toMatchObject({ provider: "claude", isolation: "host", editCalls: 1 });
  });

  it("names the instructions each run started with, taken before the agent could edit them", async () => {
    const roleDefinition = ".ai/agents/kaine-implementer.md";
    const e = await open({
      steps: [
        {
          role: "planner",
          output: planOutput({
            files: [
              ...planOutput().files,
              { path: roleDefinition, action: "modify", purpose: "Sharpen the builder role" }
            ]
          })
        },
        {
          role: "builder",
          output: builderOutput({ filesChanged: [FEATURE_FILE, roleDefinition] }),
          effect: async (run) => {
            await writeFeature(run);
            await appendFile(path.join(run.cwd, roleDefinition), "\nOne more rule.\n");
          },
          trace: skillCalls(ROLE_SKILLS.builder)
        },
        { role: "reviewer", output: reviewOutput() }
      ]
    });
    await e.pipeline.start(ISSUE, { override: false });
    await e.pipeline.approvePlan(ISSUE);
    expect((await stateOf(e)).stage).toBe("pr-review");

    const { records } = await readRunRecords(e.stateRoot);
    const [planner, builder, reviewer] = records.map((record) => record.harness);
    expect(builder).toMatchObject({ head: expect.stringMatching(/^[0-9a-f]{40}$/) });
    // The builder's record names what it was given, not the file it changed.
    expect(builder?.repo).toBe(planner?.repo);
    expect(reviewer?.repo).not.toBe(builder?.repo);
    // Each role has its own desk role file.
    expect(builder?.desk).not.toBe(planner?.desk);
  });
});

describe("lesson records", () => {
  it("keeps failed checks and review findings after remove, under keys without issue detail", async () => {
    const e = await open({
      steps: [
        { role: "planner", output: planOutput() },
        { role: "builder", output: builderOutput(), effect: (run) => writeFeature(run) },
        {
          role: "builder",
          output: builderOutput(),
          effect: (run) => writeFeature(run, "// fixed\n")
        },
        {
          role: "reviewer",
          output: reviewOutput({
            findings: [
              {
                severity: "Consider",
                blocking: false,
                file: FEATURE_FILE,
                line: 1,
                section: "Correctness",
                summary: "The export has no header row",
                fix: "Add one"
              }
            ]
          })
        }
      ]
    });
    e.pnpm.checkReplies.push({ code: 1, stdout: "FAIL a.test.ts: expected 1 received 2\n" });
    await e.pipeline.start(ISSUE, { override: false });
    await e.pipeline.approvePlan(ISSUE);
    expect((await stateOf(e)).stage).toBe("pr-review");

    await e.pipeline.remove(ISSUE, { force: true });

    const { records, invalidLines } = await readLessonRecords(e.stateRoot);
    expect(invalidLines).toBe(0);
    expect(records.map((record) => [record.source, record.key])).toEqual([
      ["check", expect.stringMatching(/^check\/pnpm /)],
      ["review", "review/Correctness/Consider"]
    ]);
    expect(records[1]).toMatchObject({
      issue: ISSUE,
      role: "reviewer",
      detail: "The export has no header row",
      file: FEATURE_FILE,
      repo: expect.stringMatching(/^[0-9a-f]{64}$/)
    });
  });
});
