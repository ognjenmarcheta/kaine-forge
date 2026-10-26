import {
  actionTargetProblem,
  stepOf,
  type FlowDefinition,
  type HistoryEvent,
  type IssueDetail,
  type ReviewSummary,
  type RunRecord,
  type StageId
} from "@repo/desk/contracts";

import type { DiffFile } from "../artifacts/artifact.diffstat";
import { flowStepOf, type IssueFlow } from "../flow/flow.steps";

/**
 * What the decision cards show, from the issue detail. Pure: codes, numbers, and engine text.
 * The components own the words.
 */

// --- review: files in risk order --------------------------------------------

/** `findings`: the reviewer named the file. `support`: translations and tests. `source`: the rest. */
export const FILE_GROUPS = ["findings", "source", "support"] as const;
export type FileGroup = (typeof FILE_GROUPS)[number];

const SUPPORT_FILE = /(?:^|\/)locales\/|\.(?:test|spec|e2e)\.[cm]?[jt]sx?$|\.json$/;

export interface ReviewFile {
  readonly file: DiffFile;
  readonly group: FileGroup;
  readonly findings: readonly ReviewSummary["findings"][number][];
}

/**
 * The changed files in the order a careful reader takes them: files with findings first, then
 * other source, then translations and tests. The diff order holds inside a group.
 */
export function orderReviewFiles(
  files: readonly DiffFile[],
  findings: ReviewSummary["findings"]
): ReviewFile[] {
  const entries = files.map((file): ReviewFile => {
    const own = findings.filter((finding) => finding.file === file.path);
    const group: FileGroup =
      own.length > 0 ? "findings" : SUPPORT_FILE.test(file.path) ? "support" : "source";
    return { file, group, findings: own };
  });
  return FILE_GROUPS.flatMap((group) => entries.filter((entry) => entry.group === group));
}

// --- plan: the round of the plan at the gate --------------------------------

/** How many plans reached the gate: the first plan is round 1. */
export const planRound = (history: readonly HistoryEvent[]): number =>
  Math.max(1, history.filter((entry) => entry.event === "plan-ready").length);

// --- needs-you: the incident ------------------------------------------------

/** A run that ended in a failure kind, or a check that failed the same way again. */
export type IncidentCause = NonNullable<RunRecord["failureKind"]> | "repeat";

export interface Incident {
  /** The stage that stopped: the one `continue` runs again. */
  readonly stage: StageId | null;
  /** The engine's reason, as it wrote it. */
  readonly reason: string | null;
  readonly cause: IncidentCause | null;
}

/**
 * Why the issue stopped. The likely cause comes from facts only: the latest agent run failed in
 * a known way, or the check failed with the same fingerprint again. Otherwise there is none.
 */
export function incidentOf(detail: IssueDetail): Incident {
  const { summary, state } = detail;
  const stage = summary.readable ? summary.resumeStage : null;
  const reason = summary.readable ? summary.needsYouReason : null;
  const latest = detail.runs.at(-1);
  if (latest !== undefined && !latest.ok && latest.failureKind !== null) {
    return { stage, reason, cause: latest.failureKind };
  }
  const checkLoops = Object.entries(state.loops).filter(
    ([step]) => stepOf(state.flowSnapshot, step)?.kind === "check"
  );
  const repeated =
    checkLoops.some(([, count]) => count >= 2) && state.lastCheckFingerprint !== null;
  return { stage, reason, cause: repeated ? "repeat" : null };
}

/** The command that resumes an agent session by hand: the builder's first, else any other. */
export function resumeCommandOf(detail: IssueDetail): string | null {
  const sessions = detail.resume.sessions.filter((session) => session.command !== null);
  const pick = sessions.find((session) => session.role === "builder") ?? sessions[0];
  return pick?.command ?? null;
}

// --- targets: where the owner can send the work ------------------------------

/**
 * Where the feedback of the gate `gate` may go: its `sendBack` steps, the builder's step first
 * (the usual answer), then the latest step first.
 */
export function sendBackTargets(flow: IssueFlow, gate: string): string[] {
  const targets = [...(flowStepOf(flow, gate)?.sendBack ?? [])].reverse();
  const builds = targets.filter((id) => flowStepOf(flow, id)?.role === "change");
  return [...builds, ...targets.filter((id) => !builds.includes(id))];
}

/**
 * The stages `continue` may restart from `needs-you`: intake and setup, then each step of the
 * flow that the server accepts as a target. The same rule as the server, so no choice is refused.
 */
export const retryTargets = (flow: FlowDefinition): string[] =>
  ["intake", "setup", ...flow.steps.map((step) => step.id)].filter(
    (from) => actionTargetProblem(flow, { action: "continue", from }) === null
  );

/**
 * The step a note to the builder goes to from `needs-you`: the last change step at or before
 * the stage that stopped, else the first one. `null` for a flow without a change step.
 */
export function builderStepOf(flow: IssueFlow, stopped: string | null): string | null {
  const builds = flow.steps.filter((step) => step.role === "change");
  const at = flow.steps.findIndex((step) => step.id === stopped);
  const before = builds.filter((step) => flow.steps.indexOf(step) <= at).at(-1);
  return (before ?? builds[0])?.id ?? null;
}

/**
 * Whether the work after this gate reaches GitHub with no further decision of the owner: the
 * ship step ships by itself and no gate stands between it and this gate.
 */
export function shipsWithoutReview(flow: IssueFlow, gate: string): boolean {
  const after = flow.steps.slice(flow.steps.findIndex((step) => step.id === gate) + 1);
  const ship = after.findIndex((step) => step.kind === "ship");
  return (
    ship !== -1 &&
    after[ship]?.auto === true &&
    !after.slice(0, ship).some((step) => step.kind === "gate")
  );
}
