import {
  freshLoops,
  isActiveStage,
  isTerminalStage,
  nextStepOf,
  outputOf,
  positionKind,
  stepOf,
  type FlowSnapshot,
  type FlowStep,
  type LoopCounters,
  type StageId
} from "../contracts";

/**
 * Pure interpreter of an issue's flow snapshot. It does no I/O: the runner
 * performs the side effects and feeds the outcome back as a trigger.
 *
 * Forward is the next step in flow order (after `setup`, the first step). A step's
 * `loopBack` sends the work back with a budget; a gate's `sendBack` lists where the
 * owner's feedback may go; the pr-wait step sends PR feedback to `backTo`. Human input
 * (a gate approval, feedback, continue) resets every loop budget and the last check
 * failure. A ship step is entered through `ship-confirm` at the gate directly before it, or,
 * when the step is automatic (`auto: true`), by moving forward into it. Both carry the ship guard.
 */

/** The slice of issue state that decides the next stage. */
export interface MachineState {
  readonly stage: StageId;
  readonly resumeStage: StageId | null;
  readonly loops: LoopCounters;
  readonly lastCheckFingerprint: string | null;
  /** PR feedback rounds that went back from the open PR. Human input never resets it. */
  readonly prRounds: number;
}

export type Trigger =
  | { readonly type: "start" }
  /** An engine- or agent-driven step finished. `step` guards against stale triggers. */
  | {
      readonly type: "step-complete";
      readonly step: StageId;
      readonly outcome: "ok" | "blocked";
    }
  | { readonly type: "check-result"; readonly result: "pass" }
  | { readonly type: "check-result"; readonly result: "fail"; readonly fingerprint: string }
  | { readonly type: "review-result"; readonly verdict: "approve" | "changes" }
  /** The owner approves at a gate whose next step is not a ship the owner confirms. */
  | { readonly type: "gate-approve" }
  | { readonly type: "feedback"; readonly target: StageId }
  /** The owner confirms the ship at the gate directly before the ship step. */
  | { readonly type: "ship-confirm" }
  /** New review feedback on the open PR sends the work back to the pr-wait step's `backTo`. */
  | { readonly type: "pr-feedback" }
  /** The owner merged or closed the PR on GitHub. */
  | { readonly type: "pr-closed"; readonly merged: boolean }
  | { readonly type: "error" }
  | { readonly type: "continue"; readonly from?: StageId }
  | { readonly type: "cancel" };

export type TriggerType = Trigger["type"];

/** Why an issue moved to `needs-you`. */
export type NeedsYouReason = "loop-limit" | "same-failure" | "blocked" | "error" | "pr-round-limit";

/**
 * Preconditions the runner must verify before it applies the transition.
 * `ship-gate`: confirmed, check report matches the diff, authorization valid.
 */
export type TransitionGuard = "none" | "ship-gate";

export type TransitionResult =
  | {
      readonly ok: true;
      readonly nextStage: StageId;
      readonly guard: TransitionGuard;
      readonly reason: NeedsYouReason | null;
      readonly state: MachineState;
    }
  | { readonly ok: false; readonly reason: string };

const reject = (reason: string): TransitionResult => ({ ok: false, reason });

export const transition = (
  state: MachineState,
  trigger: Trigger,
  snapshot: FlowSnapshot
): TransitionResult => {
  const here = state.stage;
  const kind = positionKind(snapshot, here);
  if (kind === null) return reject(`'${here}' is not a step of the flow '${snapshot.flow.id}'`);
  if (isTerminalStage(here)) return reject(`'${here}' is terminal and accepts no triggers`);

  /** Human input resets the loop budget and forgets the last check failure. */
  const fresh = { loops: freshLoops(snapshot), lastCheckFingerprint: null };

  const move = (
    next: StageId,
    patch: Partial<Pick<MachineState, "loops" | "lastCheckFingerprint" | "prRounds">> = {},
    reason: NeedsYouReason | null = null
  ): TransitionResult => ({
    ok: true,
    nextStage: next,
    guard: positionKind(snapshot, next) === "ship" ? "ship-gate" : "none",
    reason,
    state: {
      stage: next,
      resumeStage: next === "needs-you" ? here : null,
      loops: patch.loops ?? state.loops,
      lastCheckFingerprint:
        patch.lastCheckFingerprint === undefined
          ? state.lastCheckFingerprint
          : patch.lastCheckFingerprint,
      prRounds: patch.prRounds ?? state.prRounds
    }
  });
  const needsYou = (
    reason: NeedsYouReason,
    patch: Partial<Pick<MachineState, "lastCheckFingerprint">> = {}
  ): TransitionResult => move("needs-you", patch, reason);

  const wrongPlace = (what: string, needs: string): TransitionResult =>
    reject(`'${what}' is not valid in '${here}'; it needs ${needs}`);
  const step = stepOf(snapshot, here);

  /** Forward to the next step. Only an automatic ship is entered this way: the owner confirms the rest. */
  const forward = (patch: Parameters<typeof move>[1] = {}): TransitionResult => {
    if (here === "intake") return move("setup", patch);
    const next = nextStepOf(snapshot, here);
    if (next === undefined) return reject(`'${here}' has no next step in the flow`);
    if (next.kind === "ship" && !next.auto) {
      return reject(`'${next.id}' ships only on the owner's confirmation at the gate before it`);
    }
    return move(next.id, patch);
  };

  /** Back along the step's loop-back, or to `needs-you` once its budget is spent. */
  const loopBack = (
    from: FlowStep,
    patch: Partial<Pick<MachineState, "lastCheckFingerprint">> = {}
  ): TransitionResult => {
    if (from.loopBack === undefined) return needsYou("blocked", patch);
    const used = state.loops[from.id] ?? 0;
    if (used >= from.loopBack.limit) return needsYou("loop-limit", patch);
    return move(from.loopBack.to, { ...patch, loops: { ...state.loops, [from.id]: used + 1 } });
  };

  switch (trigger.type) {
    case "start":
      return here === "intake" ? move("intake", fresh) : wrongPlace(trigger.type, "intake");

    case "step-complete": {
      if (trigger.step !== here) {
        return reject(`stale trigger: '${trigger.step}' completed but the issue is in '${here}'`);
      }
      if (!isActiveStage(snapshot, here)) return wrongPlace(trigger.type, "a running step");
      if (trigger.outcome === "blocked") return needsYou("blocked");
      // A check and a review agent finish with their result, which picks the edge.
      if (kind === "check" || (step !== undefined && outputOf(snapshot, step) === "review")) {
        return reject(`'${here}' has no completion edge: it finishes with its result`);
      }
      if (kind === "ship") {
        const next = nextStepOf(snapshot, here);
        return next === undefined ? move("shipped") : move(next.id);
      }
      return forward();
    }

    case "check-result": {
      if (kind !== "check" || step === undefined) return wrongPlace(trigger.type, "a check step");
      if (trigger.result === "pass") return forward({ lastCheckFingerprint: null });
      const failed = { lastCheckFingerprint: trigger.fingerprint };
      if (
        step.loopBack?.stopOnSameFailure === true &&
        state.lastCheckFingerprint === trigger.fingerprint
      ) {
        return needsYou("same-failure", failed);
      }
      return loopBack(step, failed);
    }

    case "review-result": {
      if (step === undefined || outputOf(snapshot, step) !== "review") {
        return wrongPlace(trigger.type, "a review step");
      }
      return trigger.verdict === "approve" ? forward() : loopBack(step);
    }

    case "gate-approve": {
      if (kind !== "gate") return wrongPlace(trigger.type, "a gate");
      const next = nextStepOf(snapshot, here);
      if (next?.kind === "ship" && !next.auto) {
        return reject(`'${here}' leads to a ship: confirm the ship instead`);
      }
      return forward(fresh);
    }

    case "feedback": {
      const target = stepOf(snapshot, trigger.target);
      const allowed =
        target !== undefined &&
        (here === "needs-you"
          ? target.kind === "agent"
          : step?.kind === "gate" && step.sendBack.includes(target.id));
      return allowed
        ? move(trigger.target, fresh)
        : wrongPlace(`feedback(${trigger.target})`, "a gate that sends back there, or needs-you");
    }

    case "ship-confirm": {
      const next = nextStepOf(snapshot, here);
      if (kind !== "gate" || next?.kind !== "ship") {
        return wrongPlace(trigger.type, "the gate before the ship step");
      }
      return move(next.id);
    }

    case "pr-feedback": {
      if (step?.kind !== "pr-wait") return wrongPlace(trigger.type, "the pr-wait step");
      if (state.prRounds >= step.maxRounds) return needsYou("pr-round-limit");
      return move(step.backTo, { ...fresh, prRounds: state.prRounds + 1 });
    }

    case "pr-closed":
      return step?.kind === "pr-wait"
        ? move(trigger.merged ? "shipped" : "cancelled")
        : wrongPlace(trigger.type, "the pr-wait step");

    case "error":
      return isActiveStage(snapshot, here)
        ? needsYou("error")
        : reject(`'error' is not valid in '${here}'; no work runs there`);

    case "continue": {
      if (here !== "needs-you") return wrongPlace(trigger.type, "needs-you");
      const target = trigger.from ?? state.resumeStage;
      if (target === null) return reject("'continue' needs a stage: none is recorded to resume");
      // The pr-wait step only waits for the owner: continuing there runs nothing.
      if (!isActiveStage(snapshot, target) && positionKind(snapshot, target) !== "pr-wait") {
        return reject(`'continue' cannot restart '${target}'`);
      }
      return move(target, fresh);
    }

    case "cancel":
      return move("cancelled");
  }
};
