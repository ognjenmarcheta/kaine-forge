import {
  AGENT_STAGE_ROLES,
  FLOW_NODE_IDS,
  isEngineState,
  type DefinitionSource,
  type FlowDefinitionView,
  type FlowStepView,
  type IssueSummary
} from "@repo/desk/contracts";

import type { Translate } from "../i18n/i18n.t";

/**
 * The issue's own flow as the page reads it: the steps of its snapshot and where the flow file
 * came from. Every view names a stage and decides its controls from this, never from a fixed
 * pipeline. A built-in step has words in every language; a step the owner wrote shows its own
 * label as it is.
 */
export interface IssueFlow {
  readonly source: DefinitionSource;
  readonly steps: readonly FlowStepView[];
}

type ReadableSummary = Extract<IssueSummary, { readonly readable: true }>;

export const issueFlowOf = (summary: ReadableSummary): IssueFlow => ({
  source: summary.flowSource,
  steps: summary.flowSteps
});

/** The flow of an issue detail, which carries it whether or not its summary is readable. */
export const issueFlowOfView = (view: FlowDefinitionView): IssueFlow => ({
  source: view.source,
  steps: view.steps
});

/** The built-in flow the desk ships. A board names a flow only when an issue runs on another. */
export const BUILTIN_FLOW_ID = "kaine-default";

/** The node that holds intake and setup, before the first step. */
export const TICKET_NODE = "ticket";

/** The digits of a flow hash the page shows: enough to tell two snapshots apart. */
export const shortHash = (hash: string): string => hash.slice(0, 7);

/**
 * What a step does on the page. A gate right after a plan agent approves the plan; a gate right
 * before a ship the owner confirms reviews the change and ships; any other gate approves or
 * sends back. An agent is known by what it produces.
 */
export type StepRole =
  | "plan"
  | "change"
  | "review"
  | "report"
  | "plan-gate"
  | "ship-gate"
  | "gate"
  | "check"
  | "ship"
  | "pr-wait";

export const flowStepOf = (
  flow: IssueFlow,
  id: string | null | undefined
): FlowStepView | undefined => flow.steps.find((step) => step.id === id);

export function stepRoleOf(flow: IssueFlow, id: string | null | undefined): StepRole | null {
  const index = flow.steps.findIndex((step) => step.id === id);
  const step = flow.steps[index];
  if (step === undefined) return null;
  switch (step.kind) {
    case "agent": {
      const output = step.agent?.output;
      return output === "plan" || output === "change" || output === "review" ? output : "report";
    }
    case "gate": {
      // The same order as the engine: the plan approval first, then the ship confirmation.
      if (flow.steps[index - 1]?.agent?.output === "plan") return "plan-gate";
      const next = flow.steps[index + 1];
      return next?.kind === "ship" && !next.auto ? "ship-gate" : "gate";
    }
    case "check":
      return "check";
    case "ship":
      return "ship";
    case "pr-wait":
      return "pr-wait";
  }
}

/** A built-in step id of a built-in flow: the page has translated words for it. */
const hasBuiltinWords = (flow: IssueFlow | null, id: string): boolean =>
  (flow === null || flow.source === "builtin") && FLOW_NODE_IDS.some((node) => node === id);

/**
 * The name of a flow node (the graph, the stepper, the side sheet). `flow: null` when the
 * issue's flow is not known: built-in ids get their words, any other id shows as it is.
 */
export function nodeName(t: Translate, flow: IssueFlow | null, id: string): string {
  if (id === TICKET_NODE || hasBuiltinWords(flow, id)) return t(`desk.flow.node.${id}`);
  return (flow === null ? undefined : flowStepOf(flow, id)?.label) ?? id;
}

/** The name of a stage: an engine state, or a step of the issue's flow. */
export function stageName(t: Translate, flow: IssueFlow | null, stage: string): string {
  if (isEngineState(stage) || hasBuiltinWords(flow, stage)) return t(`desk.stage.${stage}`);
  return (flow === null ? undefined : flowStepOf(flow, stage)?.label) ?? stage;
}

/** The flow's nodes in order: the ticket, then every step. */
export const nodeIdsOf = (flow: IssueFlow): readonly string[] => [
  TICKET_NODE,
  ...flow.steps.map((step) => step.id)
];

/**
 * Who an agent is, in words. A built-in agent (its id is a role: planner, builder, reviewer,
 * intake) has translated words; any other agent shows its own name, or its id when the page
 * knows no name. `null`: no agent and no role.
 */
export function agentName(
  t: Translate,
  agent: { readonly id: string; readonly name?: string } | null,
  role: string | null
): string | null {
  const builtin = (id: string): boolean => AGENT_STAGE_ROLES.some((entry) => entry === id);
  if (agent !== null && !builtin(agent.id)) return agent.name ?? agent.id;
  const id = agent?.id ?? role;
  return id === null ? null : t(`desk.inspector.role.${id}`);
}

/** The two automatic loops of the built-in flow, which have words of their own. */
const BUILTIN_LOOPS: readonly string[] = ["check", "review"];

/**
 * The loop counters of an issue in words. The built-in flow says "Check 1, review 0" (`key`); a
 * flow of the owner's own names each loop step by its label. `null` when the flow has no loop.
 */
export function loopsText(
  t: Translate,
  flow: IssueFlow | null,
  loops: Readonly<Record<string, number>>,
  key: "desk.issue.loopsValue" | "desk.stats.loops"
): string | null {
  const entries = Object.entries(loops);
  if (entries.length === 0) return null;
  const builtin = flow === null || flow.source === "builtin";
  if (builtin && entries.every(([id]) => BUILTIN_LOOPS.includes(id))) {
    return t(key, { check: loops["check"] ?? 0, review: loops["review"] ?? 0 });
  }
  return entries
    .map(([id, count]) => t("desk.loops.step", { stage: stageName(t, flow, id), count }))
    .join(", ");
}
