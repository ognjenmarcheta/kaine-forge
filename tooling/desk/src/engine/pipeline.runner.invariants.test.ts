import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentEvent } from "../agents/agent.runner";
import type { IssueState } from "../contracts";
import { createPipelineRunner } from "./pipeline.runner";
import {
  FEATURE_FILE,
  ISSUE,
  bashCall,
  builderOutput,
  createPipelineEnv,
  planOutput,
  reviewOutput,
  skillCalls,
  writeFeature,
  type EnvOptions,
  type PipelineEnv,
  type RecordedRun,
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

const planStep = (over: Partial<ScriptedStep> = {}): ScriptedStep => ({
  role: "planner",
  output: planOutput(),
  ...over
});
const buildStep = (over: Partial<ScriptedStep> = {}): ScriptedStep => ({
  role: "builder",
  output: builderOutput(),
  effect: (run) => writeFeature(run),
  ...over
});
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
const reasonOf = async (e: PipelineEnv): Promise<string> =>
  (await stateOf(e)).history.filter((entry) => entry.stage === "needs-you").at(-1)?.note ?? "";

const toBuild = async (e: PipelineEnv) => {
  await e.pipeline.start(ISSUE, { override: false });
  return e.pipeline.approvePlan(ISSUE);
};

const needsYou = async (e: PipelineEnv, resume: string, contains: string) => {
  const state = await stateOf(e);
  expect(state).toMatchObject({ stage: "needs-you", resumeStage: resume, status: "waiting" });
  expect(await reasonOf(e)).toContain(contains);
};

const writeAt = async (run: RecordedRun, file: string, content = "x\n"): Promise<void> => {
  await mkdir(path.dirname(path.join(run.cwd, file)), { recursive: true });
  await writeFile(path.join(run.cwd, file), content);
};

describe("skill evidence", () => {
  it("stops a planner that never used its skill and writes no plan", async () => {
    const e = await open({ steps: [planStep({ trace: [] })] });
    const result = await e.pipeline.start(ISSUE, { override: false });
    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    await needsYou(e, "plan", "Skill 'kaine-write-plan' was not used");
    await expect(
      readFile(path.join(e.store.artifactsDir(ISSUE), "plan.json"), "utf8")
    ).rejects.toThrow();
  });

  it("accepts a read of SKILL.md as evidence", async () => {
    const read: AgentEvent = {
      type: "tool_call",
      id: "r1",
      tool: "Read",
      paths: [".claude/skills/kaine-write-plan/SKILL.md"]
    };
    const e = await open({ steps: [planStep({ trace: [read] })] });
    expect(await e.pipeline.start(ISSUE, { override: false })).toMatchObject({ stop: "gate" });
  });

  it("stops a reviewer that used a skill outside its role", async () => {
    const e = await open({
      steps: [
        planStep(),
        buildStep(),
        reviewStep({ trace: skillCalls(["kaine-review", "kaine-explain"]) })
      ]
    });
    await toBuild(e);
    await needsYou(e, "review", "Skill 'kaine-explain' is outside the list");
  });
});

describe("ref invariants", () => {
  it("stops a builder that moved HEAD, whatever else it did", async () => {
    const e = await open({
      steps: [
        planStep(),
        buildStep({
          effect: async (run) => {
            await writeFeature(run);
            await e?.commitIn(run.cwd);
          }
        })
      ]
    });
    await toBuild(e);
    await needsYou(e, "build", "engine invariant");
    expect(await reasonOf(e)).toContain("head-moved at HEAD");
    // The worktree stays as the agent left it, so the owner can look.
    await expect(readFile(path.join(e.worktree(), FEATURE_FILE), "utf8")).resolves.toContain(
      "toCsv"
    );
    // The invalid result was not kept: no session, no build artifact.
    expect((await stateOf(e)).sessions.builder).toBeUndefined();
  });

  it("stops a planner that moved HEAD", async () => {
    const e = await open({
      steps: [planStep({ effect: (run) => e?.commitIn(run.cwd) })]
    });
    await e.pipeline.start(ISSUE, { override: false });
    await needsYou(e, "plan", "head-moved");
  });

  it("stops a reviewer that added a tag or pushed to the stash", async () => {
    const tag = await open({
      steps: [
        planStep(),
        buildStep(),
        reviewStep({ effect: (run) => tag.fake?.addRef(run.cwd, "refs/tags/v9") })
      ]
    });
    await toBuild(tag);
    await needsYou(tag, "review", "ref-added at refs/tags/v9");
    await tag.cleanup();

    const stash = await open({
      steps: [
        planStep(),
        buildStep(),
        reviewStep({ effect: (run) => stash.fake?.stashPush(run.cwd) })
      ]
    });
    await toBuild(stash);
    await needsYou(stash, "review", "stash-changed");
  });

  it("checks the invariants even when the run itself failed", async () => {
    const e = await open({
      steps: [
        planStep(),
        buildStep({
          effect: (run) => e?.commitIn(run.cwd),
          output: undefined,
          failure: { kind: "timeout", timeoutMs: 5 }
        })
      ]
    });
    await toBuild(e);
    const reason = await reasonOf(e);
    expect(reason).toContain("head-moved");
    expect(reason).toContain("The run also failed: The agent timed out after 5 ms.");
  });
});

describe("read-only roles", () => {
  it("stops a planner that edits a file", async () => {
    const e = await open({ steps: [planStep({ effect: (run) => writeAt(run, "src/oops.ts") })] });
    await e.pipeline.start(ISSUE, { override: false });
    await needsYou(e, "plan", "planner is read-only, but the worktree diff changed (src/oops.ts)");
  });

  it("stops a reviewer that edits a file", async () => {
    const e = await open({
      steps: [
        planStep(),
        buildStep(),
        reviewStep({ effect: (run) => writeAt(run, FEATURE_FILE, "tampered\n") })
      ]
    });
    await toBuild(e);
    await needsYou(e, "review", "reviewer is read-only, but the worktree diff changed");
  });
});

describe("builder scope and hygiene", () => {
  it("stops a builder that changes a file the plan does not list", async () => {
    const e = await open({
      steps: [
        planStep(),
        buildStep({
          effect: async (run) => {
            await writeFeature(run);
            await writeAt(run, "src/extra.ts");
          }
        })
      ]
    });
    await toBuild(e);
    await needsYou(e, "build", "'src/extra.ts', which the approved plan does not list");
  });

  it("stops a builder that writes a protected path, even one the plan lists", async () => {
    const e = await open({
      steps: [
        planStep({
          output: planOutput({
            files: [{ path: "src/feature.ts", action: "create", purpose: "ok" }]
          })
        }),
        buildStep({
          effect: async (run) => {
            await writeFeature(run);
            await writeAt(run, ".github/workflows/ci.yml");
          }
        })
      ]
    });
    await toBuild(e);
    await needsYou(e, "build", "protected");
  });

  it("accepts generated GraphQL output without a plan entry", async () => {
    const e = await open({
      steps: [
        planStep(),
        buildStep({
          effect: async (run) => {
            await writeFeature(run);
            await writeAt(run, "apps/api/schema.graphql", "type Query { a: Int }\n");
          }
        }),
        reviewStep()
      ]
    });
    expect(await toBuild(e)).toMatchObject({ stop: "gate" });
  });

  it("stops a builder that tried a forbidden command", async () => {
    const e = await open({
      steps: [
        planStep(),
        buildStep({
          trace: [...skillCalls(["kaine-test"]), bashCall("b1", "git commit -m wip")]
        })
      ]
    });
    await toBuild(e);
    await needsYou(e, "build", "forbidden command (git commit)");
  });

  it("goes on after a builder was denied a harmless command", async () => {
    const e = await open({
      steps: [
        planStep(),
        buildStep({ denials: [{ tool: "Bash", command: "pnpm format:check", paths: [] }] })
      ]
    });
    await toBuild(e);
    const state = await stateOf(e);
    expect(state.history.some((entry) => entry.event === "build-complete")).toBe(true);
    expect(state.resumeStage).not.toBe("build");
  });

  it("stops a builder whose denied command was forbidden, even when the run ended well", async () => {
    const e = await open({
      steps: [
        planStep(),
        buildStep({ denials: [{ tool: "Bash", command: "git push origin HEAD", paths: [] }] })
      ]
    });
    await toBuild(e);
    await needsYou(e, "build", "Permission denied for Bash: git push origin HEAD");
  });

  it("stops a builder that claims a check it did not run", async () => {
    const e = await open({
      steps: [
        planStep(),
        buildStep({
          output: builderOutput({
            claimedChecks: [{ command: "pnpm --filter @repo/demo test", result: "pass" }]
          })
        })
      ]
    });
    await toBuild(e);
    await needsYou(e, "build", "claims it ran 'pnpm --filter @repo/demo test'");
  });
});

describe("agent failures", () => {
  it.each([
    ["a timeout", { kind: "timeout", timeoutMs: 1000 } as const, "timed out after 1000 ms"],
    [
      "a process error",
      {
        kind: "process-error",
        message: "claude exited with code 1",
        exitCode: 1,
        stderrTail: "no auth"
      } as const,
      "no auth"
    ],
    [
      "a schema mismatch",
      { kind: "schema-mismatch", issues: [{ path: "files", message: "Required" }] } as const,
      "does not match the schema: files: Required"
    ],
    ["no result", { kind: "no-result", message: "The stream ended" } as const, "The stream ended"]
  ])("records %s as a precise needs-you reason", async (_name, failure, text) => {
    const e = await open({ steps: [planStep({ output: undefined, failure })] });
    const result = await e.pipeline.start(ISSUE, { override: false });
    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    await needsYou(e, "plan", text);
    expect((await stateOf(e)).sessions.planner).toBeUndefined();
  });

  it("re-parses the result with the contract schema", async () => {
    const e = await open({
      steps: [planStep({ output: { ...planOutput(), unexpected: true } })]
    });
    await e.pipeline.start(ISSUE, { override: false });
    await needsYou(e, "plan", "does not match the schema");
  });

  it("turns a throwing runner into needs-you and frees the agent slot", async () => {
    const e = await open();
    const pipeline = createPipelineRunner({
      ...e.deps,
      runnerFor: () => ({ run: () => Promise.reject(new Error("spawn exploded")) })
    });
    const result = await pipeline.start(ISSUE, { override: false });
    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    expect(await reasonOf(e)).toContain("spawn exploded");
    expect(e.deps.scheduler?.agent.active()).toBe(0);
  });

  it("refuses an unusable plan", async () => {
    const e = await open({
      steps: [
        planStep({
          output: planOutput({
            files: [{ path: ".husky/pre-commit", action: "modify", purpose: "hook" }]
          })
        })
      ]
    });
    await e.pipeline.start(ISSUE, { override: false });
    await needsYou(e, "plan", "'.husky/pre-commit' is a protected path");
  });
});

describe("what the agent is given", () => {
  it("passes role, permissions, settings and receipts for each run", async () => {
    const e = await open({
      steps: [planStep(), buildStep(), reviewStep()],
      config: { models: { builder: "sonnet" } },
      extraFiles: { "packages/demo/package.json": JSON.stringify({ name: "@repo/demo" }) }
    });
    e.runner.requests.length = 0;
    await e.pipeline.start(ISSUE, { override: false });
    // The planner lists a file inside the demo package, so the builder may run its scripts.
    await toBuild(e);
    const [planner, builder, reviewer] = e.runner.requests;

    expect(planner).toMatchObject({
      role: "planner",
      provider: "claude",
      skills: ["kaine-write-plan"],
      skillMode: "invoke",
      cwd: e.worktree()
    });
    expect(planner?.permissions.allow).not.toContain("Edit");
    expect(planner?.systemAppend).toContain("Agent Desk rules");
    expect(builder).toMatchObject({ model: "sonnet", allowCodexBuilder: false });
    expect(builder?.permissions.allow).toContain("Edit");
    expect(reviewer).toMatchObject({ provider: "codex", model: undefined });
    expect(reviewer?.prompt).toContain(path.join(e.store.artifactsDir(ISSUE), "diff.patch"));

    const settings = JSON.parse(await readFile(builder?.settingsPath ?? "", "utf8")) as {
      hooks: { PreToolUse: unknown[]; PostToolUse: unknown[] };
    };
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PostToolUse).toHaveLength(1);
    expect(builder?.receiptsPath).toBe(
      path.join(e.store.artifactsDir(ISSUE), "receipts-builder.jsonl")
    );
    // The issue text reaches the prompt only inside the untrusted fence.
    expect(planner?.prompt).toContain("<<<BEGIN UNTRUSTED ISSUE DATA>>>");
    expect(planner?.prompt).toContain("Title: Export reports");
  });

  it("derives the builder's workspaces from the files in the plan", async () => {
    const file = "packages/demo/src/feature.ts";
    const e = await open({
      steps: [
        planStep({
          output: planOutput({
            files: [{ path: file, action: "create", purpose: "x" }],
            tests: []
          })
        }),
        buildStep({ effect: (run) => writeAt(run, file) }),
        reviewStep()
      ],
      extraFiles: { "packages/demo/package.json": JSON.stringify({ name: "@repo/demo" }) }
    });
    await toBuild(e);
    const builder = e.runner.requests.find((request) => request.role === "builder");
    expect(builder?.permissions.allow).toEqual(
      expect.arrayContaining([
        "Bash(pnpm --filter @repo/demo test:*)",
        "Bash(pnpm --filter @repo/demo typecheck:*)",
        "Bash(pnpm --filter @repo/demo lint:*)"
      ])
    );
    // A file with no package around it gets no pnpm filter.
    expect(builder?.permissions.allow.some((rule) => rule.includes("--filter *"))).toBe(false);
  });

  it("records the child pid while the agent runs and clears it after", async () => {
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const e = await open({ steps: [planStep({ pid: 4242, hold })] });
    const running = e.pipeline.start(ISSUE, { override: false });
    await vi.waitFor(
      async () => {
        expect((await stateOf(e)).activeProcess).toMatchObject({ pid: 4242, role: "planner" });
      },
      { timeout: 20_000, interval: 10 }
    );
    expect((await stateOf(e)).status).toBe("running");
    release();
    await running;
    expect((await stateOf(e)).activeProcess).toBeNull();
  });
});
