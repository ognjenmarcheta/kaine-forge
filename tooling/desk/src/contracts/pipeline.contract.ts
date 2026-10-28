import { z } from "zod";

/**
 * Stage names, node kinds, and default loop limits of the built-in `kaine-default` flow. The
 * flow model takes its nodes and edges from the flow snapshot, not from this file.
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
  "cancelled",
  "finished"
] as const;

export const stageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof stageSchema>;

/**
 * States the engine owns outside every flow: `intake` and `setup` run before the first step,
 * `needs-you` waits for the owner, `shipped`, `cancelled` and `finished` end the issue. A flow
 * step may not use one of these ids.
 */
export const ENGINE_STATES = [
  "intake",
  "setup",
  "needs-you",
  "shipped",
  "cancelled",
  "finished"
] as const;
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

/**
 * Stages that accept no further triggers. `shipped`: the desk saw the PR merged. `finished`: a
 * flow without a ship step ran every step, and nothing shipped.
 */
export const TERMINAL_STAGES = [
  "shipped",
  "cancelled",
  "finished"
] as const satisfies readonly Stage[];

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
