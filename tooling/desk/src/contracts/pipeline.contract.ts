import { z } from "zod";

/**
 * Single source of truth for the desk pipeline. The engine, the CLI, and the
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
  "shipped",
  "needs-you",
  "cancelled"
] as const;

export const stageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof stageSchema>;

/** Who does the work in a stage: the issue, an agent, the engineer, or a script. */
export const NODE_KINDS = ["source", "agent", "human", "script"] as const;
export const nodeKindSchema = z.enum(NODE_KINDS);
export type NodeKind = z.infer<typeof nodeKindSchema>;

/** Stages where the engineer decides. Nothing runs while the issue waits here. */
export const HUMAN_GATES = ["plan-gate", "pr-review"] as const satisfies readonly Stage[];
export type HumanGate = (typeof HUMAN_GATES)[number];

/** Stages that accept no further triggers. */
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

export type LoopLimits = Readonly<Record<LoopName, number>>;

/** Loop-backs to `build` that the engine allows before it asks the engineer. */
export const DEFAULT_LOOP_LIMITS: LoopLimits = { check: 3, review: 2 };

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
    { id: "ship", kind: "script" }
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
    { from: "ship", to: "shipped" }
  ],
  humanGates: [...HUMAN_GATES],
  loopEdges: [
    { from: "plan-gate", to: "plan", counter: null },
    { from: "check", to: "build", counter: "check" },
    { from: "review", to: "build", counter: "review" },
    { from: "pr-review", to: "build", counter: null },
    { from: "pr-review", to: "review", counter: null },
    { from: "pr-review", to: "plan", counter: null }
  ]
};
