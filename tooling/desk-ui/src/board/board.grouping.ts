import type { IssueSummary } from "@repo/desk/contracts";

import { BOARD_GROUPS, issueStatusOf, type BoardGroup } from "../status/status.model";

const updatedAtOf = (summary: IssueSummary): string => (summary.readable ? summary.updatedAt : "");

/** The most recently changed first. Unreadable issues have no time and come first, by number. */
const byRecency = (a: IssueSummary, b: IssueSummary): number => {
  if (a.readable !== b.readable) return a.readable ? 1 : -1;
  const left = updatedAtOf(a);
  const right = updatedAtOf(b);
  if (left === right) return a.issueNumber - b.issueNumber;
  return left < right ? 1 : -1;
};

export function groupIssues(issues: readonly IssueSummary[]): Record<BoardGroup, IssueSummary[]> {
  const groups: Record<BoardGroup, IssueSummary[]> = {
    "needs-you": [],
    waiting: [],
    running: [],
    done: []
  };
  for (const summary of issues) groups[issueStatusOf(summary).group].push(summary);
  for (const group of BOARD_GROUPS) groups[group].sort(byRecency);
  return groups;
}

/**
 * Does the issue match the search? A number (with or without `#`) matches the start of the
 * issue number; any other text matches the title, ignoring case. An empty search matches all.
 */
export function matchesSearch(summary: IssueSummary, search: string): boolean {
  const query = search.trim().toLocaleLowerCase();
  if (query === "") return true;
  const number = /^#?(\d+)$/.exec(query)?.[1];
  if (number !== undefined) return String(summary.issueNumber).startsWith(number);
  return summary.readable && (summary.title ?? "").toLocaleLowerCase().includes(query);
}

const waitingSince = (summary: IssueSummary): string =>
  summary.readable ? (summary.stageEnteredAt ?? summary.updatedAt) : "";

/** The longest wait first. Unreadable issues have no time and come first, by number. */
const byLongestWait = (a: IssueSummary, b: IssueSummary): number => {
  if (a.readable !== b.readable) return a.readable ? 1 : -1;
  const left = waitingSince(a);
  const right = waitingSince(b);
  if (left === right) return a.issueNumber - b.issueNumber;
  return left < right ? -1 : 1;
};

/** The owner's turn as an inbox: what stopped, then the decisions at a gate, oldest first. */
export interface YourTurn {
  readonly needsYou: readonly IssueSummary[];
  readonly decisions: readonly IssueSummary[];
}

export function yourTurn(groups: Readonly<Record<BoardGroup, readonly IssueSummary[]>>): YourTurn {
  return {
    needsYou: [...groups["needs-you"]].sort(byLongestWait),
    decisions: [...groups.waiting].sort(byLongestWait)
  };
}

/** Filters of the Columns layout. Each counts the issues that match the search. */
export const BOARD_FILTERS = ["all", "needs-you", "waiting", "running", "loops", "cost"] as const;
export type BoardFilter = (typeof BOARD_FILTERS)[number];

/** The "Cost over" filter keeps issues whose runs cost more than this, in US dollars. */
export const COST_FILTER_USD = 2;

/** `costs` holds the total run cost of each issue that has one, from the run stats. */
export function matchesFilter(
  summary: IssueSummary,
  filter: BoardFilter,
  costs: ReadonlyMap<number, number>
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "needs-you":
    case "waiting":
    case "running":
      return issueStatusOf(summary).group === filter;
    case "loops":
      return summary.readable && summary.loops.check + summary.loops.review > 0;
    case "cost":
      return (costs.get(summary.issueNumber) ?? 0) > COST_FILTER_USD;
  }
}
