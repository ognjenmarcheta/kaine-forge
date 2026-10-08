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
