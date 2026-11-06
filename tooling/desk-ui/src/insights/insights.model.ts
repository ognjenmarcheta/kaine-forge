import type { LessonCandidate, RunGroup, StatsDay } from "@repo/desk/contracts";

/** One series of the last seven days: the total and the value of each day, oldest first. */
export interface WeekSeries {
  /** `null` when no day has a value (no run reported a cost). */
  readonly total: number | null;
  /** `null` for a day without a value. */
  readonly values: readonly (number | null)[];
}

export interface Week {
  readonly runs: WeekSeries;
  readonly costUsd: WeekSeries;
  readonly shipped: WeekSeries;
}

const seriesOf = (values: readonly (number | null)[]): WeekSeries => {
  const known = values.filter((value): value is number => value !== null);
  return {
    total: known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0),
    values
  };
};

/** The three cards of "Last 7 days", from `RunStats.days`. */
export const weekOf = (days: readonly StatsDay[]): Week => ({
  runs: seriesOf(days.map((day) => day.runs)),
  costUsd: seriesOf(days.map((day) => day.costUsd)),
  shipped: seriesOf(days.map((day) => day.shipped))
});

/**
 * The points of a sparkline in a 100 × 36 view box: left to right, the highest value on top.
 * A day without a value draws as zero; the text equivalent says "none" for it.
 */
export const sparkPoints = (values: readonly (number | null)[]): string => {
  const numbers = values.map((value) => value ?? 0);
  const high = Math.max(...numbers);
  const low = Math.min(...numbers);
  const steps = Math.max(1, numbers.length - 1);
  return numbers
    .map((value, index) => {
      const x = (index / steps) * 100;
      const y = 32 - ((value - low) / Math.max(1, high - low)) * 28;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
};

export interface AgentCost {
  readonly agentId: string;
  /** `null` when no run of the agent reported a cost. */
  readonly costUsd: number | null;
  /** Of the most expensive agent, from 0 to 1. */
  readonly share: number;
}

/** The total cost of each agent over every provider and model, the most expensive first. */
export const costByAgent = (groups: readonly RunGroup[]): AgentCost[] => {
  const totals = new Map<string, number | null>();
  for (const group of groups) {
    const before = totals.get(group.agentId) ?? null;
    const cost = group.totalCostUsd;
    totals.set(group.agentId, cost === null ? before : (before ?? 0) + cost);
  }
  const highest = Math.max(0, ...[...totals.values()].map((cost) => cost ?? 0));
  return [...totals.entries()]
    .map(([agentId, costUsd]) => ({
      agentId,
      costUsd,
      share: costUsd === null || highest === 0 ? 0 : costUsd / highest
    }))
    .sort((a, b) => (b.costUsd ?? -1) - (a.costUsd ?? -1));
};

const ISSUE_URL = /^(https:\/\/[^/?#]+\/[^/?#]+\/[^/?#]+\/issues\/)\d+$/;

/**
 * The GitHub link of `issue`, from the link of another issue of the same repository. `null`
 * when no such link is known: the page shows the number without a link.
 */
export const issueUrlFrom = (known: string | null, issue: number): string | null => {
  const base = known === null ? undefined : ISSUE_URL.exec(known)?.[1];
  return base === undefined ? null : `${base}${String(issue)}`;
};

export const LESSON_RANKS = ["high", "medium", "low"] as const;
export type LessonRank = (typeof LESSON_RANKS)[number];

/** Spread in at least this many issues, and still seen now, ranks a lesson high. */
export const HIGH_RANK_ISSUES = 4;

/**
 * How much a lesson asks for attention. Low: seen only under older instructions, so it may be
 * fixed already. When the current instructions are unknown, no lesson ranks low.
 */
export const lessonRank = (candidate: LessonCandidate, currentKnown: boolean): LessonRank => {
  if (currentKnown && candidate.currentOccurrences === 0) return "low";
  return candidate.issues.length >= HIGH_RANK_ISSUES ? "high" : "medium";
};
