import type { IssueSummary, JobState } from "@repo/desk/contracts";

import { isOpenJob } from "../jobs/job.model";
import { issueStatusOf, type InboxGroup } from "../status/status.model";

/**
 * One piece of work on the desk: a GitHub issue or a desk job. The Inbox, All work, the nav
 * count, and the notifications read work through this, so a job and an issue that wait on the
 * owner are counted and ordered the same way.
 */
export type WorkItem =
  | {
      readonly kind: "issue";
      readonly key: string;
      readonly group: InboxGroup;
      readonly summary: IssueSummary;
    }
  | {
      readonly kind: "job";
      readonly key: string;
      readonly group: InboxGroup;
      readonly job: JobState;
    };

/** Where a desk job sits: its own status names the group. */
export const jobGroupOf = (job: Pick<JobState, "status">): InboxGroup => {
  switch (job.status) {
    case "needs-you":
      return "stopped";
    case "waiting":
      return "decide";
    case "running":
      return "running";
    case "done":
    case "cancelled":
      return "finished";
  }
};

/** The key of an issue's or a job's item: unread marks and the queue use it. */
export const issueKey = (issueNumber: number): string => `issue-${String(issueNumber)}`;
export const jobKey = (jobId: number): string => `job-${String(jobId)}`;

export const issueItem = (summary: IssueSummary): WorkItem => ({
  kind: "issue",
  key: issueKey(summary.issueNumber),
  group: issueStatusOf(summary).group,
  summary
});

export const jobItem = (job: JobState): WorkItem => ({
  kind: "job",
  key: jobKey(job.id),
  group: jobGroupOf(job),
  job
});

/** Every issue and desk job. */
export const workItems = (
  issues: Readonly<Record<number, IssueSummary>>,
  jobs: Readonly<Record<number, JobState>>
): WorkItem[] => [...Object.values(issues).map(issueItem), ...Object.values(jobs).map(jobItem)];

/** The groups that wait on the owner, in the order the Inbox shows them. */
export const TURN_GROUPS = ["stopped", "decide", "github"] as const satisfies readonly InboxGroup[];

export const isTurn = (group: InboxGroup): boolean => TURN_GROUPS.some((turn) => turn === group);

/** When the item entered the state it is in now: what a wait counts from. `null` when unknown. */
export const sinceOf = (item: WorkItem): string | null => {
  if (item.kind === "job") return item.job.updatedAt;
  return item.summary.readable ? (item.summary.stageEnteredAt ?? item.summary.updatedAt) : null;
};

/** When the item last changed, for "newest first". */
export const updatedOf = (item: WorkItem): string =>
  item.kind === "job" ? item.job.updatedAt : item.summary.readable ? item.summary.updatedAt : "";

/** The longest wait first. Items without a time (unreadable issues) come first. */
export const byLongestWait = (left: WorkItem, right: WorkItem): number => {
  const a = sinceOf(left) ?? "";
  const b = sinceOf(right) ?? "";
  if (a === b) return left.key.localeCompare(right.key);
  return a < b ? -1 : 1;
};

/** The newest change first. */
export const byNewest = (left: WorkItem, right: WorkItem): number => {
  const a = updatedOf(left);
  const b = updatedOf(right);
  if (a === b) return left.key.localeCompare(right.key);
  return a < b ? 1 : -1;
};

/** The Inbox: each group that waits on the owner, oldest wait first. */
export function inboxGroups(items: readonly WorkItem[]): Record<InboxGroup, WorkItem[]> {
  const groups: Record<InboxGroup, WorkItem[]> = {
    stopped: [],
    decide: [],
    github: [],
    running: [],
    finished: []
  };
  for (const item of items) groups[item.group].push(item);
  for (const group of TURN_GROUPS) groups[group].sort(byLongestWait);
  groups.running.sort(byNewest);
  groups.finished.sort(byNewest);
  return groups;
}

/** How many items wait on the owner: the nav badge and the page title. */
export const turnCount = (items: readonly WorkItem[]): number =>
  items.filter((item) => isTurn(item.group)).length;

/** Work that has not ended. */
export const isOpenItem = (item: WorkItem): boolean =>
  item.kind === "job" ? isOpenJob(item.job) : item.group !== "finished";
