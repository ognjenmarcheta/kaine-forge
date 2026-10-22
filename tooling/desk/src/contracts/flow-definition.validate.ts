import {
  AGENT_TOOLS,
  DEFINITION_ID_PATTERN,
  isAgentTool,
  type AgentDefinition
} from "./agent-definition.contract";
import type { FlowDefinition, FlowStep } from "./flow-definition.contract";
import { ENGINE_STATES } from "./pipeline.contract";

/**
 * Rules a schema cannot state: references between steps and agents, step
 * order, and what this checkout has installed. Pure, so the browser can run it
 * as the owner edits a flow. Every rule reports; nothing stops at the first error.
 */

/** `step`: the id of the step at fault, or `null` for the flow as a whole. */
export interface FlowError {
  readonly step: string | null;
  readonly message: string;
}

/** `field`: the frontmatter field at fault, or `null` for the agent as a whole. */
export interface AgentError {
  readonly field: string | null;
  readonly message: string;
}

/** MCP server and skill names a checkout has installed. The capability resolver removes anything else an agent asks for. */
export interface InstalledCapabilities {
  readonly mcp: readonly string[];
  readonly skills: readonly string[];
}

const badId = (id: string): string | null =>
  DEFINITION_ID_PATTERN.test(id)
    ? null
    : `'${id}' is not a valid id: use lowercase letters, digits and hyphens (at most 64)`;

/** Step ids a step points back to, each with the field that names it. */
const backReferences = (step: FlowStep): { readonly field: string; readonly to: string }[] => {
  const references =
    step.loopBack === undefined ? [] : [{ field: "loopBack.to", to: step.loopBack.to }];
  if (step.kind === "gate")
    references.push(...step.sendBack.map((to) => ({ field: "sendBack", to })));
  if (step.kind === "pr-wait") references.push({ field: "backTo", to: step.backTo });
  return references;
};

export const validateFlow = (
  flow: FlowDefinition,
  agents: readonly Pick<AgentDefinition, "id" | "output">[]
): FlowError[] => {
  const errors: FlowError[] = [];
  const add = (step: string | null, message: string): void => {
    errors.push({ step, message });
  };
  const flowIdError = badId(flow.id);
  if (flowIdError !== null) add(null, flowIdError);

  const outputOf = new Map(agents.map((agent) => [agent.id, agent.output]));
  const seen = new Set<string>();
  flow.steps.forEach((step, index) => {
    const idError = badId(step.id);
    if (idError !== null) add(step.id, idError);
    if (seen.has(step.id)) add(step.id, `Step id '${step.id}' is used more than once`);
    if (ENGINE_STATES.some((state) => state === step.id)) {
      add(step.id, `Step id '${step.id}' is reserved for the engine`);
    }
    seen.add(step.id);

    const earlier = new Set(flow.steps.slice(0, index).map((entry) => entry.id));
    for (const { field, to } of backReferences(step)) {
      if (!earlier.has(to)) add(step.id, `${field} '${to}' must name an earlier step`);
    }
    if (step.loopBack !== undefined && step.loopBack.limit < 1) {
      add(step.id, "loopBack.limit must be at least 1");
    }

    if (step.kind === "agent") {
      const output = outputOf.get(step.agent);
      if (output === undefined) add(step.id, `Agent '${step.agent}' does not exist`);
      if (output === "intake")
        add(step.id, `Agent '${step.agent}' is an intake agent and cannot run in a flow`);
    }
    if (step.kind === "pr-wait" && flow.steps[index - 1]?.kind !== "ship") {
      add(step.id, "A pr-wait step must come directly after the ship step");
    }
  });

  if (!flow.steps.some((step) => step.kind === "agent"))
    add(null, "A flow needs at least one agent step");

  const ships = flow.steps.flatMap((step, index) => (step.kind === "ship" ? [index] : []));
  for (const extra of ships.slice(1)) {
    add(flow.steps[extra]?.id ?? null, "A flow can have only one ship step");
  }
  const ship = ships[0];
  if (ship !== undefined) {
    // Ship writes the PR summary and changeset from `plan.json`. A step with an unknown or
    // intake agent already has its own error, so it does not count against this rule.
    const outputs = flow.steps
      .slice(0, ship)
      .flatMap((step) => (step.kind === "agent" ? [outputOf.get(step.agent)] : []));
    const unresolved = outputs.some((output) => output === undefined || output === "intake");
    if (!unresolved && !outputs.includes("plan")) {
      add(flow.steps[ship]?.id ?? null, "The ship step needs a plan agent step before it");
    }
    // The last change before the ship must pass a check before it ships.
    const lastChange = flow.steps
      .slice(0, ship)
      .map((step) => step.kind === "agent" && outputOf.get(step.agent) === "change")
      .lastIndexOf(true);
    const checked = flow.steps.slice(lastChange + 1, ship).some((step) => step.kind === "check");
    if (!checked) {
      add(
        flow.steps[ship]?.id ?? null,
        "The ship step must come after a check step that follows the last change"
      );
    }
  }
  return errors;
};

/**
 * Rules of the agent itself. What it asks for that a checkout has not installed is no error:
 * the capability resolver removes it from the run and records why.
 */
export const validateAgent = (agent: AgentDefinition): AgentError[] => {
  const errors: AgentError[] = [];
  const idError = badId(agent.id);
  if (idError !== null) errors.push({ field: "id", message: idError });

  const { preset } = agent.capabilities;
  if (agent.output === "change" && preset !== "edit-code") {
    errors.push({
      field: "capabilities.preset",
      message: "A change agent needs the edit-code preset"
    });
  }
  if (preset === "edit-code" && agent.output !== "change") {
    errors.push({
      field: "capabilities.preset",
      message: "Only a change agent may use the edit-code preset"
    });
  }
  const { tools } = agent.capabilities;
  for (const tool of tools.filter((name) => !isAgentTool(name))) {
    errors.push({
      field: "capabilities.tools",
      message: `Unknown tool '${tool}': use one of ${AGENT_TOOLS.join(", ")}`
    });
  }
  if (tools.length > 0 && preset !== "edit-code") {
    errors.push({
      field: "capabilities.tools",
      message: "Tools write files: they need the edit-code preset"
    });
  }
  return errors;
};
