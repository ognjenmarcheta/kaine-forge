import type {
  ActionName,
  ActionOutcome,
  ApiErrorCode,
  HealthReport,
  IssueDetail,
  IssueSummary,
  LogEntry,
  ServerEvent
} from "@repo/desk/contracts";

import type { StreamStatus } from "../api/api.stream";

/** Entries the page keeps for one issue. The server keeps the same number. */
export const LOG_CAPACITY = 500;

export type SessionState = "pending" | "ready" | "unauthorized" | "unavailable";

/** The latest result the server reported for an issue (the `action-result` event). */
export interface ActionNote {
  readonly seq: number;
  readonly action: ActionName;
  readonly outcome: ActionOutcome | null;
  readonly error: { readonly code: ApiErrorCode; readonly detail: string | null } | null;
}

export interface DetailEntry {
  readonly detail: IssueDetail;
  /** Which summary revision this detail was read at. */
  readonly revision: string;
}

/** One source of truth, keyed by issue number. */
export interface DeskState {
  readonly session: SessionState;
  readonly connection: StreamStatus;
  readonly issues: Readonly<Record<number, IssueSummary>>;
  readonly issuesLoaded: boolean;
  readonly details: Readonly<Record<number, DetailEntry>>;
  readonly logs: Readonly<Record<number, readonly LogEntry[]>>;
  readonly notes: Readonly<Record<number, ActionNote>>;
  readonly noteCounter: number;
  readonly health: HealthReport | null;
}

export const initialDeskState: DeskState = {
  session: "pending",
  connection: "connecting",
  issues: {},
  issuesLoaded: false,
  details: {},
  logs: {},
  notes: {},
  noteCounter: 0,
  health: null
};

export type DeskAction =
  | { readonly type: "session"; readonly session: SessionState }
  | { readonly type: "connection"; readonly connection: StreamStatus }
  | { readonly type: "issues-loaded"; readonly issues: readonly IssueSummary[] }
  | { readonly type: "detail-loaded"; readonly entry: DetailEntry }
  | {
      readonly type: "logs-loaded";
      readonly issueNumber: number;
      readonly entries: readonly LogEntry[];
    }
  | { readonly type: "health-loaded"; readonly report: HealthReport }
  | { readonly type: "server-event"; readonly event: ServerEvent };

/** A change of the summary: the detail and the cards refetch when this string differs. */
export const revisionOf = (summary: IssueSummary): string =>
  summary.readable
    ? `${summary.updatedAt}|${summary.stage}|${summary.status}|${String(summary.busy)}`
    : `unreadable|${summary.reason}|${String(summary.busy)}`;

const updatedAtOf = (summary: IssueSummary): string => (summary.readable ? summary.updatedAt : "");

/** The newer of two summaries of one issue. A late answer never replaces a newer event. */
const newerSummary = (current: IssueSummary | undefined, incoming: IssueSummary): IssueSummary =>
  current !== undefined && updatedAtOf(current) > updatedAtOf(incoming) ? current : incoming;

const without = <T>(record: Readonly<Record<number, T>>, key: number): Record<number, T> => {
  const copy = { ...record };
  delete copy[key];
  return copy;
};

/** Merge log entries by `seq`: sorted, without duplicates, the newest `LOG_CAPACITY`. */
export const mergeLog = (
  existing: readonly LogEntry[],
  incoming: readonly LogEntry[]
): readonly LogEntry[] => {
  if (incoming.length === 0) return existing;
  const bySeq = new Map<number, LogEntry>();
  for (const entry of existing) bySeq.set(entry.seq, entry);
  for (const entry of incoming) bySeq.set(entry.seq, entry);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-LOG_CAPACITY);
};

const applyEvent = (state: DeskState, event: ServerEvent): DeskState => {
  switch (event.type) {
    case "issue-updated": {
      const { issueNumber } = event.summary;
      return {
        ...state,
        issues: {
          ...state.issues,
          [issueNumber]: newerSummary(state.issues[issueNumber], event.summary)
        }
      };
    }
    case "issue-removed":
      return {
        ...state,
        issues: without(state.issues, event.issueNumber),
        details: without(state.details, event.issueNumber),
        logs: without(state.logs, event.issueNumber),
        notes: without(state.notes, event.issueNumber)
      };
    case "action-result": {
      const seq = state.noteCounter + 1;
      return {
        ...state,
        noteCounter: seq,
        notes: {
          ...state.notes,
          [event.issueNumber]: {
            seq,
            action: event.action,
            outcome: event.outcome,
            error: event.error
          }
        }
      };
    }
    case "log": {
      const { issueNumber } = event.entry;
      return {
        ...state,
        logs: {
          ...state.logs,
          [issueNumber]: mergeLog(state.logs[issueNumber] ?? [], [event.entry])
        }
      };
    }
    case "health":
      return { ...state, health: event.report };
  }
};

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
  switch (action.type) {
    case "session":
      return state.session === action.session ? state : { ...state, session: action.session };
    case "connection":
      return state.connection === action.connection
        ? state
        : { ...state, connection: action.connection };
    case "issues-loaded": {
      const issues: Record<number, IssueSummary> = {};
      for (const incoming of action.issues) {
        issues[incoming.issueNumber] = newerSummary(state.issues[incoming.issueNumber], incoming);
      }
      // An issue the server no longer lists is gone: drop what the page kept for it.
      return {
        ...state,
        issues,
        issuesLoaded: true,
        details: Object.fromEntries(
          Object.entries(state.details).filter(([key]) => Number(key) in issues)
        ),
        session: "ready"
      };
    }
    case "detail-loaded":
      return {
        ...state,
        details: { ...state.details, [action.entry.detail.summary.issueNumber]: action.entry }
      };
    case "logs-loaded":
      return {
        ...state,
        logs: {
          ...state.logs,
          [action.issueNumber]: mergeLog(state.logs[action.issueNumber] ?? [], action.entries)
        }
      };
    case "health-loaded":
      return { ...state, health: action.report };
    case "server-event":
      return applyEvent(state, action.event);
  }
}
