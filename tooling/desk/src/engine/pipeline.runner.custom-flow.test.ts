import { readFile, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";

import type {
  AgentCapabilities,
  FlowDefinition,
  FlowStep,
  IssueState,
  ReviewFinding
} from "../contracts";
import { readRunRecords } from "../stats/stats.runs";
import { DEFAULT_SNAPSHOT, writeFiles } from "../testing/flow.testing";
import { snapshotOf } from "../testing/github.fake";
import {
  FEATURE_FILE,
  ISSUE,
  builderOutput,
  createPipelineEnv,
  planOutput,
  reviewOutput,
  writeFeature,
  type PipelineEnv,
  type ScriptedStep
} from "../testing/pipeline.testing";

/**
 * Issues on a flow of the repository's own: `.desk/flows/kaine-default.yaml` overrides the
 * built-in flow by id, and `.desk/agents/*.md` adds agents. The engine runs the snapshot it
 * took at Start, whatever the files say later.
 */

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

const stateOf = async (e: PipelineEnv): Promise<IssueState> => {
  const read = await e.store.read(ISSUE);
  if (read.status !== "ok") throw new Error(`state is ${read.status}`);
  return read.state;
};
const historyOf = async (e: PipelineEnv): Promise<string[]> =>
  (await stateOf(e)).history.map((entry) => `${entry.stage}:${entry.event}`);

/** The default flow with `extra` inserted after the step `after`. */
const flowWith = (after: string, extra: FlowStep): FlowDefinition => ({
  ...DEFAULT_SNAPSHOT.flow,
  name: "Kaine default with more",
  steps: DEFAULT_SNAPSHOT.flow.steps.flatMap((entry): FlowStep[] =>
    entry.id === after ? [entry, extra] : [entry]
  )
});

const agentFile = (
  id: string,
  output: "report" | "review",
  body: string,
  provider: "claude" | "codex" = "claude",
  capabilities: AgentCapabilities = { preset: "read-only", mcp: [], skills: [] }
): string =>
  `---\n${stringify({
    id,
    name: id,
    description: `The ${id} agent.`,
    provider,
    output,
    capabilities
  })}---\n\n${body}\n`;

const writeFlow = (e: PipelineEnv, flow: FlowDefinition, agents: Record<string, string>) =>
  writeFiles(e.repoRoot, {
    ".desk/flows/kaine-default.yaml": stringify(flow),
    ...Object.fromEntries(
      Object.entries(agents).map(([id, text]) => [`.desk/agents/${id}.md`, text])
    )
  });

const NOTES_PROMPT = "# Release notes writer\n\nWrite release notes. NOTES-PROMPT-ONE";
const notesStep: FlowStep = { id: "notes", kind: "agent", label: "Notes", agent: "release-notes" };
const notesRun: ScriptedStep = {
  role: "planner",
  output: { summary: "Adds a CSV export.", findings: [], plainLanguage: "Notes are ready." }
};

const planStep: ScriptedStep = { role: "planner", output: planOutput() };
const buildStep: ScriptedStep = {
  role: "builder",
  output: builderOutput(),
  effect: (run) => writeFeature(run)
};
const approveStep: ScriptedStep = { role: "reviewer", output: reviewOutput() };

const critical: ReviewFinding = {
  severity: "Critical",
  blocking: true,
  file: FEATURE_FILE,
  line: 1,
  section: "Security, Auth & Tenancy",
  summary: "The export writes cells without escaping formulas",
  fix: "Prefix cells that start with = with a quote"
};

describe("a flow of the repository's own", () => {
  it("runs a report agent between the review and the change approval", async () => {
    const e = await open([planStep, buildStep, approveStep, notesRun]);
    await writeFlow(e, flowWith("review", notesStep), {
      "release-notes": agentFile("release-notes", "report", NOTES_PROMPT)
    });

    await e.pipeline.start(ISSUE, { override: false });
    const result = await e.pipeline.approvePlan(ISSUE);

    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    const history = await historyOf(e);
    expect(history.slice(history.indexOf("review:review-approved"))).toEqual([
      "review:review-approved",
      "notes:stage-started",
      "notes:report-ready"
    ]);
    expect((await stateOf(e)).stage).toBe("pr-review");

    const notes = e.runner.requests.at(-1);
    expect(notes?.prompt).toContain("NOTES-PROMPT-ONE");
    expect(notes?.prompt).not.toContain("# Agent Desk planner");
    expect(notes?.provider).toBe("claude");
    const report: unknown = JSON.parse(
      await readFile(`${e.store.artifactsDir(ISSUE)}/report-release-notes.json`, "utf8")
    );
    expect(report).toMatchObject({ summary: "Adds a CSV export." });
    const { records } = await readRunRecords(e.stateRoot);
    expect(records.map((record) => record.agentId)).toEqual([
      "planner",
      "builder",
      "reviewer",
      "release-notes"
    ]);
  });

  it("stops a second review agent at its own loop limit and sends its findings to build", async () => {
    const security: FlowStep = {
      id: "security",
      kind: "agent",
      label: "Security review",
      agent: "security-reviewer",
      loopBack: { to: "build", limit: 1 }
    };
    const changes: ScriptedStep = {
      role: "reviewer",
      provider: "codex",
      output: reviewOutput({ verdict: "changes-requested", findings: [critical] })
    };
    const e = await open([
      planStep,
      buildStep,
      approveStep,
      changes,
      buildStep,
      approveStep,
      changes
    ]);
    await writeFlow(e, flowWith("review", security), {
      "security-reviewer": agentFile(
        "security-reviewer",
        "review",
        "# Security reviewer\n\nLook for injection.",
        "codex"
      )
    });

    await e.pipeline.start(ISSUE, { override: false });
    const result = await e.pipeline.approvePlan(ISSUE);

    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    expect(await stateOf(e)).toMatchObject({
      stage: "needs-you",
      resumeStage: "security",
      loops: { check: 0, review: 0, security: 1 }
    });
    expect(result.outcome === "stopped" && result.message).toContain(
      "still asks for changes after 1 round(s)"
    );
    const builders = e.runner.requests.filter((request) => request.role === "builder");
    expect(builders).toHaveLength(2);
    expect(builders[1]?.prompt).toContain("escaping formulas");
  });

  it("keeps running on the snapshot it took at Start when the files change", async () => {
    const e = await open([planStep, buildStep, approveStep, notesRun]);
    await writeFlow(e, flowWith("review", notesStep), {
      "release-notes": agentFile("release-notes", "report", NOTES_PROMPT)
    });
    await e.pipeline.start(ISSUE, { override: false });
    const started = await stateOf(e);

    // The owner edits the files while the issue waits at the plan gate.
    await writeFlow(e, DEFAULT_SNAPSHOT.flow, {
      "release-notes": agentFile("release-notes", "report", "# Changed\n\nNOTES-PROMPT-TWO")
    });
    await e.pipeline.approvePlan(ISSUE);

    const done = await stateOf(e);
    expect(done.stage).toBe("pr-review");
    expect(done.flowSnapshot).toEqual(started.flowSnapshot);
    expect(await historyOf(e)).toContain("notes:report-ready");
    expect(e.runner.requests.at(-1)?.prompt).toContain("NOTES-PROMPT-ONE");
    expect(e.runner.requests.at(-1)?.prompt).not.toContain("NOTES-PROMPT-TWO");
  });

  it("starts an agent that asks for what is not installed, installs the rest, and records what it got", async () => {
    // The checkout installs one more server and skill than the built-in agents use.
    const installs = {
      ".ai/mcp.json": JSON.stringify({ mcpServers: { serena: {}, context7: {}, playwright: {} } }),
      ".ai/skills/kaine-explain.md": "---\nname: kaine-explain\n---\nkaine-explain\n"
    };
    const e = await createPipelineEnv({
      steps: [planStep, buildStep, approveStep, notesRun],
      extraFiles: installs
    });
    env = e;
    await writeFiles(e.repoRoot, installs);
    await writeFlow(e, flowWith("review", notesStep), {
      "release-notes": agentFile("release-notes", "report", NOTES_PROMPT, "claude", {
        preset: "read-only",
        mcp: ["playwright", "jira"],
        skills: ["kaine-explain", "kaine-nope"]
      })
    });

    const started = await e.pipeline.start(ISSUE, { override: false });
    expect(started).toMatchObject({ outcome: "stopped", stop: "gate" });
    const install = e.pnpm.calls.find((call) => call.argv[1] === "ai:install")?.argv ?? [];
    expect(install.slice(install.indexOf("--skill"))).toEqual([
      "--skill",
      "kaine-explain,kaine-review,kaine-test,kaine-write-plan",
      "--mcp",
      "serena,context7,playwright",
      "--serena-interface",
      "tools"
    ]);

    await e.pipeline.approvePlan(ISSUE);
    const notes = e.runner.requests.at(-1);
    expect(notes?.skills).toEqual(["kaine-explain"]);
    expect(notes?.permissions.allow).toContain("mcp__playwright");
    const { records } = await readRunRecords(e.stateRoot);
    const receipt = records.find((record) => record.agentId === "release-notes")?.capabilities;
    expect(receipt).toMatchObject({
      sandbox: "host",
      mcp: ["playwright"],
      skills: ["kaine-explain"],
      removed: [
        { kind: "skill", name: "kaine-nope", reason: "not installed" },
        { kind: "mcp", name: "jira", reason: "not installed" }
      ]
    });
    expect(receipt?.tools.allow).toEqual(notes?.permissions.allow);
  });
});

describe("the flow an issue starts on", () => {
  /** Two more flows in the repository, and a config that picks them by label and by default. */
  const openWithFlows = async (labels: readonly string[]): Promise<PipelineEnv> => {
    const e = await createPipelineEnv({
      steps: [planStep],
      config: { flowLabels: { docs: "docs-only" }, defaultFlow: "fast-lane" },
      github: { snapshot: snapshotOf({ labels: ["ready-for-agent", ...labels] }) }
    });
    env = e;
    const copy = (id: string): string =>
      stringify({ ...DEFAULT_SNAPSHOT.flow, id, name: `Flow ${id}` });
    await writeFiles(e.repoRoot, {
      ".desk/flows/docs-only.yaml": copy("docs-only"),
      ".desk/flows/fast-lane.yaml": copy("fast-lane")
    });
    return e;
  };

  it.each([
    {
      name: "the flow the owner names",
      flowId: "kaine-default",
      labels: ["docs"],
      expected: "kaine-default"
    },
    {
      name: "the flow of the first listed label",
      flowId: undefined,
      labels: ["bug", "docs"],
      expected: "docs-only"
    },
    {
      name: "the configured default flow",
      flowId: undefined,
      labels: ["bug"],
      expected: "fast-lane"
    }
  ])("runs on $name", async ({ flowId, labels, expected }) => {
    const e = await openWithFlows(labels);

    const result = await e.pipeline.start(ISSUE, { override: false, flowId });

    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    expect((await stateOf(e)).flowSnapshot.flow.id).toBe(expected);
  });

  it("refuses a flow the registry does not have, and keeps no state", async () => {
    const e = await openWithFlows([]);

    const result = await e.pipeline.start(ISSUE, { override: false, flowId: "nope" });

    expect(result).toMatchObject({ outcome: "refused", refusal: "intake-refused" });
    expect(result.outcome === "refused" && result.reason).toContain(
      "The flow 'nope' is not available."
    );
    expect(await e.store.read(ISSUE)).toEqual({ status: "missing" });
    expect(e.runner.requests).toHaveLength(0);
  });
});

describe("a state file from before flow snapshots", () => {
  it("drives on the built-in default flow and is stored as version 2", async () => {
    const e = await open([planStep, buildStep, approveStep]);
    await e.pipeline.start(ISSUE, { override: false });
    // The same issue at the plan gate, as the desk wrote it before flow snapshots.
    const current = Object.entries(await stateOf(e)).filter(([key]) => key !== "flowSnapshot");
    await writeFile(
      e.store.statePath(ISSUE),
      JSON.stringify({ ...Object.fromEntries(current), schemaVersion: 1 }, null, 2)
    );

    const result = await e.pipeline.approvePlan(ISSUE);

    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    const raw: unknown = JSON.parse(await readFile(e.store.statePath(ISSUE), "utf8"));
    expect(raw).toMatchObject({ schemaVersion: 2, stage: "pr-review" });
    expect((await stateOf(e)).flowSnapshot).toEqual(DEFAULT_SNAPSHOT);
  });
});
