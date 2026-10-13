import type { RunRecords } from "./stats.runs";
import {
  AGENT_STAGE_ROLES,
  HARNESS_SHORT_LENGTH,
  type AgentStageRole,
  type IssueRollup,
  type LoopCounters,
  type RunGroup,
  type RunRecord,
  type RunStats,
  type Stage
} from "../contracts";
import type { IssueListEntry } from "../store/store.issue";

export interface IssueSnapshot {
  readonly issue: number;
  readonly stage: Stage;
  readonly loops: LoopCounters;
}

/** Stage and loops of every readable issue. An unreadable issue shows as if removed. */
export const snapshotsOf = (entries: readonly IssueListEntry[]): IssueSnapshot[] =>
  entries.flatMap((entry) =>
    entry.result.status === "ok"
      ? [
          {
            issue: entry.issueNumber,
            stage: entry.result.state.stage,
            loops: entry.result.state.loops
          }
        ]
      : []
  );

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : sum(values) / values.length;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? 0) + upper) / 2;
};

const present = (values: readonly (number | null)[]): number[] =>
  values.filter((value): value is number => value !== null);

const totalCost = (records: readonly RunRecord[]): number | null => {
  const costs = present(records.map((record) => record.costUsd));
  return costs.length === 0 ? null : sum(costs);
};

/** The short hashes a group shows. `null` for a run recorded without a fingerprint. */
const shortHarness = (record: RunRecord): RunGroup["harness"] =>
  record.harness === null
    ? null
    : {
        repo: record.harness.repo.slice(0, HARNESS_SHORT_LENGTH),
        desk: record.harness.desk.slice(0, HARNESS_SHORT_LENGTH)
      };

const groupOf = (records: readonly RunRecord[], byHarness: boolean): RunGroup => {
  const [first] = records;
  if (first === undefined) throw new RangeError("A run group needs at least one record");
  const costs = present(records.map((record) => record.costUsd));
  return {
    role: first.role,
    provider: first.provider,
    model: first.model,
    runs: records.length,
    accepted: records.filter((record) => record.accepted).length,
    stuck: records.filter((record) => record.failureKind === "stuck").length,
    timeouts: records.filter((record) => record.failureKind === "timeout").length,
    medianDurationMs: median(records.map((record) => record.durationMs)),
    meanInputTokens: mean(
      present(
        records.map((record) =>
          record.usage === null ? null : record.usage.inputTokens + record.usage.cachedInputTokens
        )
      )
    ),
    meanOutputTokens: mean(present(records.map((record) => record.usage?.outputTokens ?? null))),
    totalCostUsd: costs.length === 0 ? null : sum(costs),
    meanCostUsd: mean(costs),
    meanTurns: mean(present(records.map((record) => record.turns))),
    meanEditCalls: sum(records.map((record) => record.editCalls)) / records.length,
    harness: byHarness ? shortHarness(first) : null
  };
};

const ROLE_ORDER: readonly AgentStageRole[] = AGENT_STAGE_ROLES;

export interface AggregateOptions {
  /** Also split the groups by harness version, to compare instructions before and after a change. */
  readonly byHarness?: boolean;
}

/** Groups runs by role, provider and model, and rolls them up per issue. */
export const aggregateRuns = (
  { records, invalidLines }: RunRecords,
  snapshots: readonly IssueSnapshot[],
  { byHarness = false }: AggregateOptions = {}
): RunStats => {
  const byGroup = new Map<string, RunRecord[]>();
  const byIssue = new Map<number, RunRecord[]>();
  for (const record of records) {
    const harness = byHarness ? shortHarness(record) : null;
    const key = JSON.stringify([record.role, record.provider, record.model, harness]);
    byGroup.set(key, [...(byGroup.get(key) ?? []), record]);
    byIssue.set(record.issue, [...(byIssue.get(record.issue) ?? []), record]);
  }
  const groups = [...byGroup.values()]
    .map((group) => groupOf(group, byHarness))
    .sort(
      (left, right) =>
        ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role) ||
        left.provider.localeCompare(right.provider) ||
        (left.model ?? "").localeCompare(right.model ?? "")
    );

  const snapshotOf = new Map(snapshots.map((snapshot) => [snapshot.issue, snapshot]));
  const issueNumbers = [...new Set([...byIssue.keys(), ...snapshotOf.keys()])].sort(
    (left, right) => left - right
  );
  const issues = issueNumbers.map((issue): IssueRollup => {
    const runs = byIssue.get(issue) ?? [];
    const snapshot = snapshotOf.get(issue);
    return {
      issue,
      stage: snapshot?.stage ?? null,
      loops: snapshot?.loops ?? null,
      runs: runs.length,
      totalCostUsd: totalCost(runs)
    };
  });
  return { groups, issues, invalidLines };
};
