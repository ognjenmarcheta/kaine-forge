import {
  ACTIVE_STAGES,
  DEFAULT_LOOP_LIMITS,
  TERMINAL_STAGES,
  type ActiveStage,
  type FeedbackTarget,
  type LoopCounters,
  type LoopLimits,
  type Stage
} from "../contracts";

/**
 * Pure transition table for the desk pipeline. It does no I/O: the runner
 * performs the side effects and feeds the outcome back as a trigger.
 */

/** The slice of issue state that decides the next stage. */
export interface MachineState {
  readonly stage: Stage;
  readonly resumeStage: Stage | null;
  readonly loops: LoopCounters;
  readonly lastCheckFingerprint: string | null;
}

export type Trigger =
  | { readonly type: "start" }
  /** An engine- or agent-driven stage finished. `stage` guards against stale triggers. */
  | {
      readonly type: "stage-complete";
      readonly stage: ActiveStage;
      readonly outcome: "ok" | "blocked";
    }
  | { readonly type: "approve-plan" }
  | { readonly type: "feedback"; readonly target: FeedbackTarget }
  | { readonly type: "check-pass" }
  | { readonly type: "check-fail"; readonly fingerprint: string }
  | { readonly type: "review-approve" }
  | { readonly type: "review-changes" }
  | { readonly type: "ship-confirm" }
  | { readonly type: "error" }
  | { readonly type: "continue"; readonly from?: Stage }
  | { readonly type: "cancel" };

export type TriggerType = Trigger["type"];

/** Why an issue moved to `needs-you`. */
export type NeedsYouReason = "loop-limit" | "same-failure" | "blocked" | "error";

/**
 * Preconditions the runner must verify before it applies the transition.
 * `ship-gate`: confirmed, check report matches the diff, authorization valid.
 */
export type TransitionGuard = "none" | "ship-gate";

export type TransitionResult =
  | {
      readonly ok: true;
      readonly nextStage: Stage;
      readonly guard: TransitionGuard;
      readonly reason: NeedsYouReason | null;
      readonly state: MachineState;
    }
  | { readonly ok: false; readonly reason: string };

const NO_LOOPS: LoopCounters = { check: 0, review: 0 };

const FORWARD_ON_OK: Readonly<Partial<Record<Stage, Stage>>> = {
  intake: "setup",
  setup: "plan",
  plan: "plan-gate",
  build: "check",
  ship: "shipped"
};

const FEEDBACK_FROM: Readonly<Record<FeedbackTarget, readonly Stage[]>> = {
  plan: ["plan-gate", "pr-review", "needs-you"],
  build: ["pr-review", "needs-you"],
  review: ["pr-review", "needs-you"]
};

const isTerminal = (stage: Stage): boolean =>
  TERMINAL_STAGES.some((terminal) => terminal === stage);
const isActive = (stage: Stage): stage is ActiveStage =>
  ACTIVE_STAGES.some((active) => active === stage);

const reject = (reason: string): TransitionResult => ({ ok: false, reason });

const move = (
  state: MachineState,
  nextStage: Stage,
  patch: Partial<Pick<MachineState, "loops" | "lastCheckFingerprint">> = {},
  extra: { guard?: TransitionGuard; reason?: NeedsYouReason } = {}
): TransitionResult => ({
  ok: true,
  nextStage,
  guard: extra.guard ?? (nextStage === "ship" ? "ship-gate" : "none"),
  reason: extra.reason ?? null,
  state: {
    stage: nextStage,
    resumeStage: nextStage === "needs-you" ? state.stage : null,
    loops: patch.loops ?? state.loops,
    lastCheckFingerprint:
      patch.lastCheckFingerprint === undefined
        ? state.lastCheckFingerprint
        : patch.lastCheckFingerprint
  }
});

const needsYou = (
  state: MachineState,
  reason: NeedsYouReason,
  patch: Partial<Pick<MachineState, "lastCheckFingerprint">> = {}
): TransitionResult => move(state, "needs-you", patch, { reason });

/** Human input resets the loop budget and forgets the last check failure. */
const FRESH_BUDGET = { loops: NO_LOOPS, lastCheckFingerprint: null } as const;

const requireStage = (state: MachineState, allowed: readonly Stage[], trigger: string) =>
  allowed.includes(state.stage)
    ? null
    : reject(`'${trigger}' is not valid in '${state.stage}'; it needs ${allowed.join(" or ")}`);

export const transition = (
  state: MachineState,
  trigger: Trigger,
  limits: LoopLimits = DEFAULT_LOOP_LIMITS
): TransitionResult => {
  if (isTerminal(state.stage)) {
    return reject(`'${state.stage}' is terminal and accepts no triggers`);
  }

  switch (trigger.type) {
    case "start":
      return requireStage(state, ["intake"], trigger.type) ?? move(state, "intake", FRESH_BUDGET);

    case "stage-complete": {
      if (trigger.stage !== state.stage) {
        return reject(
          `stale trigger: '${trigger.stage}' completed but the issue is in '${state.stage}'`
        );
      }
      if (trigger.outcome === "blocked") return needsYou(state, "blocked");
      const next = FORWARD_ON_OK[state.stage];
      return next ? move(state, next) : reject(`'${state.stage}' has no completion edge`);
    }

    case "approve-plan":
      return requireStage(state, ["plan-gate"], trigger.type) ?? move(state, "build", FRESH_BUDGET);

    case "feedback":
      return (
        requireStage(state, FEEDBACK_FROM[trigger.target], `feedback(${trigger.target})`) ??
        move(state, trigger.target, FRESH_BUDGET)
      );

    case "check-pass":
      return (
        requireStage(state, ["check"], trigger.type) ??
        move(state, "review", { lastCheckFingerprint: null })
      );

    case "check-fail": {
      const wrong = requireStage(state, ["check"], trigger.type);
      if (wrong) return wrong;
      if (state.lastCheckFingerprint === trigger.fingerprint) {
        return needsYou(state, "same-failure", { lastCheckFingerprint: trigger.fingerprint });
      }
      if (state.loops.check >= limits.check) {
        return needsYou(state, "loop-limit", { lastCheckFingerprint: trigger.fingerprint });
      }
      return move(state, "build", {
        loops: { ...state.loops, check: state.loops.check + 1 },
        lastCheckFingerprint: trigger.fingerprint
      });
    }

    case "review-approve":
      return requireStage(state, ["review"], trigger.type) ?? move(state, "pr-review");

    case "review-changes": {
      const wrong = requireStage(state, ["review"], trigger.type);
      if (wrong) return wrong;
      if (state.loops.review >= limits.review) return needsYou(state, "loop-limit");
      return move(state, "build", { loops: { ...state.loops, review: state.loops.review + 1 } });
    }

    case "ship-confirm":
      return requireStage(state, ["pr-review"], trigger.type) ?? move(state, "ship");

    case "error":
      return isActive(state.stage)
        ? needsYou(state, "error")
        : reject(`'error' is not valid in '${state.stage}'; no work runs there`);

    case "continue": {
      const wrong = requireStage(state, ["needs-you"], trigger.type);
      if (wrong) return wrong;
      const target = trigger.from ?? state.resumeStage;
      if (target === null) return reject("'continue' needs a stage: none is recorded to resume");
      if (!isActive(target)) return reject(`'continue' cannot restart '${target}'`);
      return move(state, target, FRESH_BUDGET);
    }

    case "cancel":
      return move(state, "cancelled");
  }
};
