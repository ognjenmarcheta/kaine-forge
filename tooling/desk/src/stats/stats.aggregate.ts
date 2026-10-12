import type { AgentStageRole, LoopCounters, Provider, RunRecord, Stage } from "../contracts";

/** Runs of one role with one provider and model. */
export interface RunGroup {
  readonly role: AgentStageRole;
  readonly provider: Provider;
  /** `null`: the CLI's default model. */
  readonly model: string | null;
  readonly runs: number;
  /** Runs the stage accepted (result, invariants and verification held). */
  readonly accepted: number;
  readonly stuck: number;
  readonly timeouts: number;
  readonly medianDurationMs: number;
  /** Means and totals cover only the runs that report the value. `null` when none does. */
  readonly meanInputTokens: number | null;
  readonly meanOutputTokens: number | null;
  readonly totalCostUsd: number | null;
  readonly meanCostUsd: number | null;
  readonly meanTurns: number | null;
  readonly meanEditCalls: number;
}

/** One issue: where it stands and what its runs cost. */
export interface IssueRollup {
  readonly issue: number;
  /** `null` when the issue was removed: its runs stay in the record. */
  readonly stage: Stage | null;
  readonly loops: LoopCounters | null;
  readonly runs: number;
  readonly totalCostUsd: number | null;
}

export interface RunStats {
  readonly groups: readonly RunGroup[];
  readonly issues: readonly IssueRollup[];
}

export interface IssueSnapshot {
  readonly issue: number;
  readonly stage: Stage;
  readonly loops: LoopCounters;
}

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

const groupOf = (records: readonly RunRecord[]): RunGroup => {
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
    meanInputTokens: mean(present(records.map((record) => record.usage?.inputTokens ?? null))),
    meanOutputTokens: mean(present(records.map((record) => record.usage?.outputTokens ?? null))),
    totalCostUsd: costs.length === 0 ? null : sum(costs),
    meanCostUsd: mean(costs),
    meanTurns: mean(present(records.map((record) => record.turns))),
    meanEditCalls: sum(records.map((record) => record.editCalls)) / records.length
  };
};

const ROLE_ORDER: readonly AgentStageRole[] = ["planner", "builder", "reviewer"];

/** Groups runs by role, provider and model, and rolls them up per issue. */
export const aggregateRuns = (
  records: readonly RunRecord[],
  snapshots: readonly IssueSnapshot[]
): RunStats => {
  const byGroup = new Map<string, RunRecord[]>();
  const byIssue = new Map<number, RunRecord[]>();
  for (const record of records) {
    const key = JSON.stringify([record.role, record.provider, record.model]);
    byGroup.set(key, [...(byGroup.get(key) ?? []), record]);
    byIssue.set(record.issue, [...(byIssue.get(record.issue) ?? []), record]);
  }
  const groups = [...byGroup.values()]
    .map(groupOf)
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
  return { groups, issues };
};
