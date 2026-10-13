import type { FlowNodeId, HistoryEvent, Stage } from "@repo/desk/contracts";

import type { Tone } from "../status/status.model";

/** What an event did, as the status pill of its row says. */
export type Outcome = "started" | "waiting" | "done" | "back" | "stopped" | "info";

export const OUTCOME_TONE: Readonly<Record<Outcome, Tone>> = {
  started: "information",
  waiting: "warning",
  done: "success",
  back: "warning-subtle",
  stopped: "danger",
  info: "neutral"
};

/** The events the engine writes to the history. Others show their raw name. */
const EVENT_OUTCOME: Readonly<Record<string, Outcome>> = {
  "intake-started": "started",
  "intake-restarted": "started",
  "authorization-override": "info",
  "intake-complete": "done",
  "stage-started": "started",
  "setup-complete": "done",
  "plan-ready": "waiting",
  "plan-approved": "done",
  "branch-renamed": "info",
  "branch-rename-skipped": "info",
  "build-complete": "done",
  "check-passed": "done",
  "check-failed": "back",
  "review-approved": "done",
  "review-changes-requested": "back",
  feedback: "back",
  "needs-you": "stopped",
  continued: "started",
  "ship-confirmed": "done",
  "ship-started": "started",
  shipped: "done",
  cancelled: "stopped",
  interrupted: "stopped"
};

/** True for an event the page has words for (`desk.activity.event.<name>`). */
export const isKnownEvent = (event: string): boolean => Object.hasOwn(EVENT_OUTCOME, event);

const NODE_OF_STAGE: Readonly<Record<Stage, FlowNodeId | null>> = {
  intake: "ticket",
  setup: "ticket",
  plan: "plan",
  "plan-gate": "plan-gate",
  build: "build",
  check: "check",
  review: "review",
  "pr-review": "pr-review",
  ship: "ship",
  shipped: "ship",
  "needs-you": null,
  cancelled: null
};

export interface ActivityRow {
  readonly id: string;
  readonly at: string;
  readonly event: string;
  readonly note: string | null;
  /** Time to the next event, or to now for the last event of a running issue. */
  readonly durationMs: number | null;
  readonly ongoing: boolean;
  readonly outcome: Outcome;
}

export interface ActivityGroup {
  readonly id: string;
  /** The flow node of the run, or `null` for a stop (`needs-you`, `cancelled`). */
  readonly node: FlowNodeId | null;
  readonly stage: Stage;
  /** 1 for the first run of the node, 2 for the first loop round, and so on. */
  readonly round: number;
  readonly rows: readonly ActivityRow[];
}

const elapsed = (from: string, to: number): number | null => {
  const start = Date.parse(from);
  return Number.isNaN(start) || Number.isNaN(to) ? null : Math.max(0, to - start);
};

/**
 * The history as runs of a stage, newest first. Consecutive events of one flow node form a
 * run; a node that ran before gets the next round number. Each row knows how long it lasted.
 */
export function activityGroups(
  history: readonly HistoryEvent[],
  now: number,
  running: boolean
): readonly ActivityGroup[] {
  const groups: {
    id: string;
    node: FlowNodeId | null;
    stage: Stage;
    round: number;
    rows: ActivityRow[];
  }[] = [];
  const rounds = new Map<string, number>();
  history.forEach((event, index) => {
    const next = history[index + 1];
    const last = next === undefined;
    const row: ActivityRow = {
      id: String(index),
      at: event.at,
      event: event.event,
      note: event.note ?? null,
      durationMs: last
        ? running
          ? elapsed(event.at, now)
          : null
        : elapsed(event.at, Date.parse(next.at)),
      ongoing: last && running,
      outcome: EVENT_OUTCOME[event.event] ?? "info"
    };
    const node = NODE_OF_STAGE[event.stage];
    const groupKey = node ?? event.stage;
    const open = groups.at(-1);
    if (open !== undefined && (open.node ?? open.stage) === groupKey) {
      open.rows.push(row);
      return;
    }
    const round = (rounds.get(groupKey) ?? 0) + 1;
    rounds.set(groupKey, round);
    groups.push({ id: String(index), node, stage: event.stage, round, rows: [row] });
  });
  return groups.reverse().map((group) => ({ ...group, rows: [...group.rows].reverse() }));
}
