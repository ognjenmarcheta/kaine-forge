import type {
  HistoryEvent,
  IssueDetail,
  ReviewSummary,
  RunRecord,
  StageId
} from "@repo/desk/contracts";

import type { DiffFile } from "../artifacts/artifact.diffstat";

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
  const repeated = (state.loops.check ?? 0) >= 2 && state.lastCheckFingerprint !== null;
  return { stage, reason, cause: repeated ? "repeat" : null };
}

/** The command that resumes an agent session by hand: the builder's first, else any other. */
export function resumeCommandOf(detail: IssueDetail): string | null {
  const sessions = detail.resume.sessions.filter((session) => session.command !== null);
  const pick = sessions.find((session) => session.role === "builder") ?? sessions[0];
  return pick?.command ?? null;
}
