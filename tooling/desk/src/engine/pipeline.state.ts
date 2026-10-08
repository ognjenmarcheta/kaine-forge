import {
  HUMAN_GATES,
  STAGES,
  TERMINAL_STAGES,
  type HistoryEvent,
  type IssueState,
  type IssueStatus,
  type Stage
} from "../contracts";
import type { MachineState } from "./pipeline.machine";

/** The slice of an issue's state that the pure machine reads. */
export const machineOf = (state: IssueState): MachineState => ({
  stage: state.stage,
  resumeStage: state.resumeStage,
  loops: state.loops,
  lastCheckFingerprint: state.lastCheckFingerprint
});

export const isGate = (stage: Stage): boolean => HUMAN_GATES.some((gate) => gate === stage);
export const isTerminalStage = (stage: Stage): boolean =>
  TERMINAL_STAGES.some((terminal) => terminal === stage);

/**
 * The status an issue has right after a transition into `stage`. A gate and
 * `needs-you` wait for a person. A stage the engine drives is `queued`: if the
 * process dies before it starts, recovery turns it into `needs-you`.
 */
export const statusAfterMove = (stage: Stage): IssueStatus => {
  if (stage === "needs-you" || isGate(stage)) return "waiting";
  if (isTerminalStage(stage)) return "done";
  return "queued";
};

/** The reason from the latest `needs-you` event in the history, or `null`. */
export const needsYouReason = (state: IssueState): string | null => {
  if (state.stage !== "needs-you") return null;
  const latest = state.history.filter((event) => event.stage === "needs-you").at(-1);
  return latest?.note ?? null;
};

/**
 * History events that move an issue into a stage. A stage the engine drives starts with its
 * own `stage-started` event; a gate is reached by the event that ends the stage before it.
 */
const ENTERED_BY: Readonly<Partial<Record<Stage, readonly string[]>>> = {
  intake: ["intake-started", "intake-restarted"],
  "plan-gate": ["plan-ready"],
  "pr-review": ["review-approved"],
  shipped: ["shipped"],
  "needs-you": ["needs-you", "interrupted"],
  cancelled: ["cancelled"]
};

const enteredStage = (event: HistoryEvent): Stage | null =>
  event.event === "stage-started"
    ? event.stage
    : (STAGES.find((stage) => ENTERED_BY[stage]?.includes(event.event) === true) ?? null);

/**
 * When the issue entered its current stage: the time of the latest event that entered a
 * stage, if that stage is the current one. `null` when the history does not say, for example
 * while a queued stage has not written its start yet.
 */
export const stageEnteredAt = (state: IssueState): string | null => {
  const latest = [...state.history].reverse().find((event) => enteredStage(event) !== null);
  return latest !== undefined && enteredStage(latest) === state.stage ? latest.at : null;
};
