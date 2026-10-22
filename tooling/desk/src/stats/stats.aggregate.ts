import type { RunRecords } from "./stats.runs";
import {
  AGENT_STAGE_ROLES,
  HARNESS_SHORT_LENGTH,
  PLAN_RISKS,
  STATS_DAYS,
  type AgentStageRole,
  type IssueRollup,
  type LoopCounters,
  type RiskOutcome,
  type RunGroup,
  type RunRecord,
  type RunStats,
  type Stage,
  type StatsDay
} from "../contracts";
import type { IssueListEntry } from "../store/store.issue";

export interface IssueSnapshot {
  readonly issue: number;
  readonly stage: Stage;
  readonly loops: LoopCounters;
  /** When the desk last opened or updated the issue's PR, from the history. */
  readonly shippedAt?: string | null;
}

/** The history events of a ship that opened or updated the PR. */
const SHIP_EVENTS: ReadonlySet<string> = new Set(["pr-opened", "pr-updated"]);

/** Stage and loops of every readable issue. An unreadable issue shows as if removed. */
export const snapshotsOf = (entries: readonly IssueListEntry[]): IssueSnapshot[] =>
  entries.flatMap((entry) =>
    entry.result.status === "ok"
      ? [
          {
            issue: entry.issueNumber,
            stage: entry.result.state.stage,
            loops: entry.result.state.loops,
            shippedAt:
              [...entry.result.state.history]
                .reverse()
                .find((event) => SHIP_EVENTS.has(event.event))?.at ?? null
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
  /** The end of the day series. Default: the system time. */
  readonly now?: Date;
}

const SHIPPED_STAGES: ReadonlySet<Stage> = new Set(["pr-open", "shipped"]);

/** Outcomes per plan risk. An issue counts at the risk of its latest graded run. */
const riskOutcomes = (
  byIssue: ReadonlyMap<number, readonly RunRecord[]>,
  snapshotOf: ReadonlyMap<number, IssueSnapshot>
): RiskOutcome[] => {
  const outcomes = new Map(
    PLAN_RISKS.map((risk): [RiskOutcome["risk"], RiskOutcome] => [
      risk,
      { risk, issues: 0, shipped: 0, sentBack: 0 }
    ])
  );
  for (const [issue, runs] of byIssue) {
    const risk = [...runs].reverse().find((run) => run.planRisk !== null)?.planRisk ?? null;
    const outcome = risk === null ? undefined : outcomes.get(risk);
    if (outcome === undefined) continue;
    const snapshot = snapshotOf.get(issue);
    const plans = runs.filter((run) => run.role === "planner" && run.accepted).length;
    const reviewLoops = Math.max(
      snapshot?.loops.review ?? 0,
      ...runs.map((run) => run.loops.review)
    );
    outcome.issues += 1;
    if (snapshot !== undefined && SHIPPED_STAGES.has(snapshot.stage)) outcome.shipped += 1;
    if (plans > 1 || reviewLoops > 0) outcome.sentBack += 1;
  }
  return [...outcomes.values()];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Runs, cost and shipped issues of the last `STATS_DAYS` UTC days, oldest first. */
const daySeries = (
  records: readonly RunRecord[],
  snapshots: readonly IssueSnapshot[],
  now: Date
): StatsDay[] =>
  Array.from({ length: STATS_DAYS }, (_, index): StatsDay => {
    const date = new Date(now.getTime() - (STATS_DAYS - 1 - index) * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const runs = records.filter((record) => record.at.slice(0, 10) === date);
    return {
      date,
      runs: runs.length,
      costUsd: totalCost(runs),
      shipped: snapshots.filter((snapshot) => snapshot.shippedAt?.slice(0, 10) === date).length
    };
  });

/** Groups runs by role, provider and model, and rolls them up per issue. */
export const aggregateRuns = (
  { records, invalidLines }: RunRecords,
  snapshots: readonly IssueSnapshot[],
  { byHarness = false, now = new Date() }: AggregateOptions = {}
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
  return {
    groups,
    issues,
    riskOutcomes: riskOutcomes(byIssue, snapshotOf),
    days: daySeries(records, snapshots, now),
    invalidLines
  };
};
