import {
  FORWARD_EVENTS,
  isTerminalStage,
  isWaitingStage,
  nextStepOf,
  type FlowSnapshot,
  type HistoryEvent,
  type IssueState,
  type IssueStatus,
  type StageId
} from "../contracts";
import type { MachineState } from "./pipeline.machine";

export { isTerminalStage };

/** The slice of an issue's state that the pure machine reads. */
export const machineOf = (state: IssueState): MachineState => ({
  stage: state.stage,
  resumeStage: state.resumeStage,
  loops: state.loops,
  lastCheckFingerprint: state.lastCheckFingerprint,
  prRounds: state.prRounds ?? 0
});

/** A gate or the open PR: the owner decides there, and nothing runs. */
export const isGate = (snapshot: FlowSnapshot, stage: StageId): boolean =>
  isWaitingStage(snapshot, stage);

/**
 * The status an issue has right after a transition into `stage`. A gate and
 * `needs-you` wait for a person. A stage the engine drives is `queued`: if the
 * process dies before it starts, recovery turns it into `needs-you`.
 */
export const statusAfterMove = (snapshot: FlowSnapshot, stage: StageId): IssueStatus => {
  if (stage === "needs-you" || isGate(snapshot, stage)) return "waiting";
  if (isTerminalStage(stage)) return "done";
  return "queued";
};

/** The reason from the latest `needs-you` event in the history, or `null`. */
export const needsYouReason = (state: IssueState): string | null => {
  if (state.stage !== "needs-you") return null;
  const latest = state.history.filter((event) => event.stage === "needs-you").at(-1);
  return latest?.note ?? null;
};

/** History events that move an issue into an engine state or the pr-wait step. */
const ENTERED_BY: readonly {
  readonly stage: StageId | "pr-wait";
  readonly events: readonly string[];
}[] = [
  { stage: "intake", events: ["intake-started", "intake-restarted"] },
  { stage: "pr-wait", events: ["pr-opened", "pr-updated"] },
  // `shipped` entered `shipped` before the `pr-open` stage existed.
  { stage: "shipped", events: ["shipped", "pr-merged"] },
  { stage: "needs-you", events: ["needs-you", "interrupted"] },
  { stage: "cancelled", events: ["cancelled", "pr-closed"] }
];

/**
 * The stage a history event moves the issue into, or `null`. A stage the engine drives starts
 * with its own `stage-started` event; a gate is reached by the event that ends the step before it.
 */
const enteredStage = (snapshot: FlowSnapshot, event: HistoryEvent): StageId | null => {
  if (event.event === "stage-started") return event.stage;
  const next = nextStepOf(snapshot, event.stage);
  if (next?.kind === "gate" && FORWARD_EVENTS.has(event.event)) return next.id;
  const entry = ENTERED_BY.find((candidate) => candidate.events.includes(event.event));
  if (entry === undefined) return null;
  if (entry.stage !== "pr-wait") return entry.stage;
  return snapshot.flow.steps.find((step) => step.kind === "pr-wait")?.id ?? null;
};

/**
 * When the issue entered its current stage: the time of the latest event that entered a
 * stage, if that stage is the current one. `null` when the history does not say, for example
 * while a queued stage has not written its start yet.
 */
export const stageEnteredAt = (state: IssueState): string | null => {
  const snapshot = state.flowSnapshot;
  const latest = [...state.history]
    .reverse()
    .find((event) => enteredStage(snapshot, event) !== null);
  return latest !== undefined && enteredStage(snapshot, latest) === state.stage ? latest.at : null;
};
