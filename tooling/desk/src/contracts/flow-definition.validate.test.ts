import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import type { AgentDefinition } from "./agent-definition.contract";
import type { FlowDefinition, FlowStep } from "./flow-definition.contract";
import { validateAgent, validateFlow } from "./flow-definition.validate";
import { parseAgentFile, parseFlowFile } from "../registry/registry.parse";

const DEFAULTS = new URL("../../defaults/", import.meta.url);

const parsed = <T>(
  result: { ok: true; definition: T } | { ok: false; errors: readonly string[] }
): T => {
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.definition;
};

const defaultAgents = async (): Promise<AgentDefinition[]> => {
  const dir = new URL("agents/", DEFAULTS);
  const names = (await readdir(dir)).filter((name) => name.endsWith(".md"));
  return Promise.all(
    names.map(async (name) => parsed(parseAgentFile(await readFile(new URL(name, dir), "utf8"))))
  );
};

const defaultFlow = async (): Promise<FlowDefinition> =>
  parsed(parseFlowFile(await readFile(new URL("flows/kaine-default.yaml", DEFAULTS), "utf8")));

const withSteps = (
  flow: FlowDefinition,
  edit: (steps: FlowStep[]) => FlowStep[]
): FlowDefinition => ({
  ...flow,
  steps: edit([...flow.steps])
});

const replaceStep = (id: string, step: FlowStep) => (steps: FlowStep[]) =>
  steps.map((entry) => (entry.id === id ? step : entry));

describe("validateFlow", () => {
  it("accepts the built-in default flow", async () => {
    expect(validateFlow(await defaultFlow(), await defaultAgents())).toEqual([]);
  });

  const intakeAgent = { id: "intake", output: "intake" } as const;
  const cases: readonly {
    readonly rule: string;
    readonly edit: (steps: FlowStep[]) => FlowStep[];
    readonly step: string | null;
    readonly message: string;
  }[] = [
    {
      rule: "ids match the id pattern",
      edit: replaceStep("plan-gate", {
        id: "Plan_Gate",
        kind: "gate",
        label: "Gate",
        sendBack: []
      }),
      step: "Plan_Gate",
      message: "is not a valid id"
    },
    {
      rule: "step ids are unique",
      edit: replaceStep("plan-gate", { id: "plan", kind: "gate", label: "Gate", sendBack: [] }),
      step: "plan",
      message: "used more than once"
    },
    {
      rule: "step ids leave the engine states free",
      edit: replaceStep("plan-gate", {
        id: "needs-you",
        kind: "gate",
        label: "Gate",
        sendBack: []
      }),
      step: "needs-you",
      message: "reserved for the engine"
    },
    {
      rule: "agent steps reference an existing agent",
      edit: replaceStep("plan", { id: "plan", kind: "agent", label: "Plan", agent: "nobody" }),
      step: "plan",
      message: "Agent 'nobody' does not exist"
    },
    {
      rule: "intake agents stay out of flows",
      edit: replaceStep("plan", {
        id: "plan",
        kind: "agent",
        label: "Plan",
        agent: intakeAgent.id
      }),
      step: "plan",
      message: "is an intake agent"
    },
    {
      rule: "loopBack.to names an earlier step",
      edit: replaceStep("check", {
        id: "check",
        kind: "check",
        label: "Check",
        commands: "loop",
        loopBack: { to: "review", limit: 3 }
      }),
      step: "check",
      message: "loopBack.to 'review' must name an earlier step"
    },
    {
      rule: "gate sendBack names earlier steps",
      edit: replaceStep("plan-gate", {
        id: "plan-gate",
        kind: "gate",
        label: "Gate",
        sendBack: ["build"]
      }),
      step: "plan-gate",
      message: "sendBack 'build' must name an earlier step"
    },
    {
      rule: "a loop-back limit is at least 1",
      edit: replaceStep("check", {
        id: "check",
        kind: "check",
        label: "Check",
        commands: "loop",
        loopBack: { to: "build", limit: 0 }
      }),
      step: "check",
      message: "loopBack.limit must be at least 1"
    },
    {
      rule: "ship comes after a check that follows the last change",
      edit: (steps) => steps.filter((step) => step.id !== "check"),
      step: "ship",
      message: "after a check step that follows the last change"
    },
    {
      rule: "pr-wait comes directly after ship",
      edit: (steps) => {
        const [ship, prOpen] = [steps.at(-2), steps.at(-1)];
        return ship === undefined || prOpen === undefined
          ? steps
          : [...steps.slice(0, -2), prOpen, ship];
      },
      step: "pr-open",
      message: "directly after the ship step"
    },
    {
      rule: "a flow has at most one ship",
      edit: (steps) => [
        ...steps,
        { id: "ship-again", kind: "ship", label: "Ship again", auto: false }
      ],
      step: "ship-again",
      message: "only one ship step"
    },
    {
      rule: "a gate does not both approve a plan and confirm a ship",
      edit: (steps) =>
        replaceStep("pr-review", {
          id: "pr-review",
          kind: "gate",
          label: "Approve",
          sendBack: ["plan", "build"]
        })(
          replaceStep("review", {
            id: "review",
            kind: "agent",
            label: "Re-plan",
            agent: "planner"
          })(steps)
        ),
      step: "pr-review",
      message: "A gate cannot both approve a plan and confirm a ship"
    }
  ];

  it.each(cases)("rejects a flow that breaks the rule: $rule", async ({ edit, step, message }) => {
    const errors = validateFlow(withSteps(await defaultFlow(), edit), [
      ...(await defaultAgents()),
      intakeAgent
    ]);
    expect(errors).toEqual([{ step, message: expect.stringContaining(message) }]);
  });

  it("rejects a ship without a plan agent before it, because ship reads plan.json", async () => {
    const flow = withSteps(await defaultFlow(), (steps) =>
      steps.filter((step) => step.id !== "plan" && step.id !== "plan-gate")
    );
    expect(validateFlow(flow, await defaultAgents())).toContainEqual({
      step: "ship",
      message: "The ship step needs a plan agent step before it"
    });
  });

  it("rejects a flow without an agent step", async () => {
    const flow = withSteps(await defaultFlow(), (steps) =>
      steps.filter((step) => step.kind !== "agent")
    );
    expect(validateFlow(flow, await defaultAgents())).toContainEqual({
      step: null,
      message: "A flow needs at least one agent step"
    });
  });
});

describe("validateAgent", () => {
  it("accepts every built-in agent", async () => {
    for (const agent of await defaultAgents()) expect(validateAgent(agent), agent.id).toEqual([]);
  });

  const agentOf = async (id: string): Promise<AgentDefinition> => {
    const agent = (await defaultAgents()).find((entry) => entry.id === id);
    if (agent === undefined) throw new Error(`No built-in agent '${id}'`);
    return agent;
  };
  it("requires the edit-code preset for a change agent, and only for one", async () => {
    const builder = await agentOf("builder");
    const planner = await agentOf("planner");
    expect(
      validateAgent({ ...builder, capabilities: { ...builder.capabilities, preset: "read-only" } })
    ).toEqual([
      { field: "capabilities.preset", message: "A change agent needs the edit-code preset" }
    ]);
    expect(
      validateAgent({ ...planner, capabilities: { ...planner.capabilities, preset: "edit-code" } })
    ).toEqual([
      { field: "capabilities.preset", message: "Only a change agent may use the edit-code preset" }
    ]);
  });

  it("accepts a known tool on an edit-code agent only, and no unknown tool", async () => {
    const builder = await agentOf("builder");
    const reviewer = await agentOf("reviewer");
    // The built-in files name no tools: an agent file without the field still parses.
    expect(builder.capabilities.tools).toEqual([]);
    const withTools = (agent: AgentDefinition, tools: string[]): AgentDefinition => ({
      ...agent,
      capabilities: { ...agent.capabilities, tools }
    });

    expect(validateAgent(withTools(builder, ["doc-export"]))).toEqual([]);
    expect(validateAgent(withTools(builder, ["shell"]))).toEqual([
      { field: "capabilities.tools", message: "Unknown tool 'shell': use one of doc-export" }
    ]);
    expect(validateAgent(withTools(reviewer, ["doc-export"]))).toEqual([
      { field: "capabilities.tools", message: "Tools write files: they need the edit-code preset" }
    ]);
  });
});
