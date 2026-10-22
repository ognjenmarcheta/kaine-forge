import { z } from "zod";

import {
  agentDefinitionSchema,
  definitionIdSchema,
  type AgentDefinition,
  type AgentOutputKind
} from "./agent-definition.contract";
import {
  flowDefinitionSchema,
  type FlowStep,
  type LoopBack,
  type StepKind
} from "./flow-definition.contract";
import { ENGINE_STATES, TERMINAL_STAGES, type EngineState } from "./pipeline.contract";

/**
 * The flow an issue runs on, frozen at Start: the flow definition and every agent it names.
 * The issue never reads the definition files again, so an edit of a file changes only the
 * issues started after it. Pure, so the browser reads a snapshot the same way the engine does.
 */

export const DEFINITION_SOURCES = ["builtin", "repo", "local"] as const;
export const definitionSourceSchema = z.enum(DEFINITION_SOURCES);
export type DefinitionSource = z.infer<typeof definitionSourceSchema>;

/** Where an issue is: a step id of its flow snapshot, or an engine state. */
export const stageIdSchema = definitionIdSchema;
export type StageId = z.infer<typeof stageIdSchema>;

export const flowSnapshotSchema = z
  .object({
    flow: flowDefinitionSchema,
    /** The agents the flow's steps name, each once. */
    agents: z.array(agentDefinitionSchema),
    /** sha256 of the normalized flow and agents. */
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    /** The source of the flow file that won by id. */
    flowSource: definitionSourceSchema
  })
  .strict();
export type FlowSnapshot = z.infer<typeof flowSnapshotSchema>;

export const isEngineState = (stage: string): stage is EngineState =>
  ENGINE_STATES.some((state) => state === stage);

export const isTerminalStage = (stage: string): boolean =>
  TERMINAL_STAGES.some((terminal) => terminal === stage);

export const stepOf = (
  snapshot: FlowSnapshot,
  id: string | null | undefined
): FlowStep | undefined => snapshot.flow.steps.find((step) => step.id === id);

export const agentOf = (snapshot: FlowSnapshot, id: string): AgentDefinition | undefined =>
  snapshot.agents.find((agent) => agent.id === id);

/** What the agent of an agent step produces, or `null` for a step of another kind. */
export const outputOf = (snapshot: FlowSnapshot, step: FlowStep): AgentOutputKind | null =>
  step.kind === "agent" ? (agentOf(snapshot, step.agent)?.output ?? null) : null;

/** What holds the issue at `stage`: an engine state or a step kind. `null`: not in the snapshot. */
export type PositionKind = EngineState | StepKind;

export const positionKind = (snapshot: FlowSnapshot, stage: string): PositionKind | null => {
  if (isEngineState(stage)) return stage;
  return stepOf(snapshot, stage)?.kind ?? null;
};

/** The owner decides here (a gate, or the open PR). Nothing runs. */
export const isWaitingStage = (snapshot: FlowSnapshot, stage: string): boolean => {
  const kind = positionKind(snapshot, stage);
  return kind === "gate" || kind === "pr-wait";
};

/** The engine drives these: intake, setup, and the agent, check and ship steps. */
export const isActiveStage = (snapshot: FlowSnapshot, stage: string): boolean => {
  const kind = positionKind(snapshot, stage);
  return (
    kind === "intake" || kind === "setup" || kind === "agent" || kind === "check" || kind === "ship"
  );
};

/** The step after `stage` in flow order. After `setup` comes the first step. */
export const nextStepOf = (snapshot: FlowSnapshot, stage: string): FlowStep | undefined => {
  const { steps } = snapshot.flow;
  if (stage === "setup") return steps[0];
  const index = steps.findIndex((step) => step.id === stage);
  return index < 0 ? undefined : steps[index + 1];
};

/**
 * The gate directly before a ship step that is not automatic: the owner confirms the ship there.
 * A gate before an automatic ship is an ordinary approval.
 */
export const isShipGate = (snapshot: FlowSnapshot, stage: string): boolean => {
  const next = nextStepOf(snapshot, stage);
  return stepOf(snapshot, stage)?.kind === "gate" && next?.kind === "ship" && !next.auto;
};

/** Steps with an automatic loop-back, in flow order. Their ids key the loop counters. */
export const loopSteps = (snapshot: FlowSnapshot): (FlowStep & { readonly loopBack: LoopBack })[] =>
  snapshot.flow.steps.flatMap((step) =>
    step.loopBack === undefined ? [] : [{ ...step, loopBack: step.loopBack }]
  );

/** A loop budget with every counter at zero. Human input brings the budget back to it. */
export const freshLoops = (snapshot: FlowSnapshot): Record<string, number> =>
  Object.fromEntries(loopSteps(snapshot).map((step) => [step.id, 0]));
