import { z } from "zod";

/**
 * The fixed layout of the built-in `kaine-default` flow. The engine, the CLI, and the
 * browser UI all read stages, node kinds, edges, and loop limits from here.
 */
export const STAGES = [
  "intake",
  "setup",
  "plan",
  "plan-gate",
  "build",
  "check",
  "review",
  "pr-review",
  "ship",
  "pr-open",
  "shipped",
  "needs-you",
  "cancelled"
] as const;

export const stageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof stageSchema>;

/**
 * States the engine owns outside every flow: `intake` and `setup` run before the first step,
 * `needs-you` waits for the owner, `shipped` and `cancelled` end the issue. A flow step may not
 * use one of these ids.
 */
export const ENGINE_STATES = ["intake", "setup", "needs-you", "shipped", "cancelled"] as const;
export type EngineState = (typeof ENGINE_STATES)[number];

/** Who does the work in a stage: the issue, an agent, the engineer, or a script. */
export const NODE_KINDS = ["source", "agent", "human", "script"] as const;
export const nodeKindSchema = z.enum(NODE_KINDS);
export type NodeKind = z.infer<typeof nodeKindSchema>;

/**
 * Stages where the engineer decides. Nothing runs while the issue waits here. At `pr-open`
 * the draft PR is on GitHub: the owner reviews and merges it there, then runs `refresh`.
 */
export const HUMAN_GATES = [
  "plan-gate",
  "pr-review",
  "pr-open"
] as const satisfies readonly Stage[];
export type HumanGate = (typeof HUMAN_GATES)[number];

/** Stages that accept no further triggers. `shipped`: the desk saw the PR merged. */
export const TERMINAL_STAGES = ["shipped", "cancelled"] as const satisfies readonly Stage[];

/** Stages the engine drives. These are the only valid `continue` targets. */
export const ACTIVE_STAGES = [
  "intake",
  "setup",
  "plan",
  "build",
  "check",
  "review",
  "ship"
] as const satisfies readonly Stage[];
export type ActiveStage = (typeof ACTIVE_STAGES)[number];

/** Where human feedback can send the issue. */
export const FEEDBACK_TARGETS = ["plan", "build", "review"] as const;
export const feedbackTargetSchema = z.enum(FEEDBACK_TARGETS);
export type FeedbackTarget = z.infer<typeof feedbackTargetSchema>;

/** Loop counters that carry a limit. */
export const LOOP_NAMES = ["check", "review"] as const;
export type LoopName = (typeof LOOP_NAMES)[number];

export type LoopLimits = Readonly<Record<LoopName, number>> & {
  /** PR feedback rounds from `pr-open` back to `build`. */
  readonly prRounds: number;
};

/** Loop-backs to `build` that the engine allows before it asks the engineer. */
export const DEFAULT_LOOP_LIMITS: LoopLimits = { check: 3, review: 2, prRounds: 3 };

export interface PipelineNode {
  readonly id: ActiveStage | HumanGate;
  readonly kind: NodeKind;
}

export interface PipelineEdge {
  readonly from: Stage;
  readonly to: Stage;
}

export interface PipelineLoopEdge extends PipelineEdge {
  /** Counter that this loop-back increments. Human-driven loops have none. */
  readonly counter: LoopName | null;
}

export interface PipelineDefinition {
  readonly nodes: readonly PipelineNode[];
  readonly forwardEdges: readonly PipelineEdge[];
  readonly humanGates: readonly HumanGate[];
  readonly loopEdges: readonly PipelineLoopEdge[];
}

export const PIPELINE: PipelineDefinition = {
  nodes: [
    { id: "intake", kind: "source" },
    { id: "setup", kind: "script" },
    { id: "plan", kind: "agent" },
    { id: "plan-gate", kind: "human" },
    { id: "build", kind: "agent" },
    { id: "check", kind: "script" },
    { id: "review", kind: "agent" },
    { id: "pr-review", kind: "human" },
    { id: "ship", kind: "script" },
    { id: "pr-open", kind: "human" }
  ],
  forwardEdges: [
    { from: "intake", to: "setup" },
    { from: "setup", to: "plan" },
    { from: "plan", to: "plan-gate" },
    { from: "plan-gate", to: "build" },
    { from: "build", to: "check" },
    { from: "check", to: "review" },
    { from: "review", to: "pr-review" },
    { from: "pr-review", to: "ship" },
    { from: "ship", to: "pr-open" },
    { from: "pr-open", to: "shipped" }
  ],
  humanGates: [...HUMAN_GATES],
  loopEdges: [
    { from: "plan-gate", to: "plan", counter: null },
    { from: "check", to: "build", counter: "check" },
    { from: "review", to: "build", counter: "review" },
    { from: "pr-review", to: "build", counter: null },
    { from: "pr-review", to: "review", counter: null },
    { from: "pr-review", to: "plan", counter: null },
    { from: "pr-open", to: "build", counter: null }
  ]
};
