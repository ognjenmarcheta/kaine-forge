import {
  SCORECARD_DIMENSIONS,
  SCORECARD_DISPOSITIONS,
  type ScorecardDisposition,
  type ScorecardFinding,
  type ScorecardRun,
  type TrackedIssue
} from "@repo/desk/contracts";

import type { Tone } from "../status/status.model";

/** The ledger's score bands, best first. `unscored`: the run could not gather the evidence. */
export const BANDS = ["top", "solid", "adequate", "weak", "absent", "unscored"] as const;
export type Band = (typeof BANDS)[number];

/** The band descriptors of the ledger: 9-10, 7-8, 5-6, 3-4, 0-2. */
export const bandOf = (score: number | null): Band => {
  if (score === null) return "unscored";
  if (score >= 9) return "top";
  if (score >= 7) return "solid";
  if (score >= 5) return "adequate";
  if (score >= 3) return "weak";
  return "absent";
};

export const BAND_TONE: Readonly<Record<Band, Tone>> = {
  top: "success",
  solid: "success",
  adequate: "warning",
  weak: "danger",
  absent: "danger",
  unscored: "neutral"
};

/** The change from the previous score to this one, to one decimal; `null` when one is missing. */
export const deltaOf = (current: number | null, previous: number | null): number | null =>
  current === null || previous === null ? null : Math.round((current - previous) * 10) / 10;

/** A run's commit as the ledger's notes name it. */
export const shortCommit = (commit: string): string => commit.slice(0, 7);

export interface Evidence {
  readonly summary: string;
  /** What keeps the dimension from the next band, one reason per entry. */
  readonly holdsBack: readonly string[];
}

const HOLDS_BACK = /\b(?:Not 9|Toward 9|Toward 8):\s*/;

/** Splits a ledger evidence line at "Not 9:" (or "Toward 9:"), then the reasons at "; ". */
export const splitEvidence = (text: string): Evidence => {
  const match = HOLDS_BACK.exec(text);
  if (match === null) return { summary: text.trim(), holdsBack: [] };
  const holdsBack = text
    .slice(match.index + match[0].length)
    .split(/;\s+/)
    .map((reason) => reason.trim().replace(/\.$/, ""))
    .filter((reason) => reason !== "");
  return { summary: text.slice(0, match.index).trim(), holdsBack };
};

export interface DimensionRow {
  /** 1-based, as the ledger keys it. */
  readonly number: number;
  readonly name: string;
  readonly score: number | null;
  readonly delta: number | null;
  readonly band: Band;
  readonly evidence: Evidence;
  /** This dimension's score in every run up to the selected one, oldest first. */
  readonly history: readonly (number | null)[];
}

const scoreIn = (run: ScorecardRun | undefined, key: string): number | null =>
  run?.dimensions[key]?.score ?? null;

/** One row per dimension for the run at `index` of `runs` (oldest first). */
export const dimensionRows = (runs: readonly ScorecardRun[], index: number): DimensionRow[] => {
  const run = runs[index];
  const previous = runs[index - 1];
  return SCORECARD_DIMENSIONS.map((name, position) => {
    const key = String(position + 1);
    const score = scoreIn(run, key);
    return {
      number: position + 1,
      name,
      score,
      delta: deltaOf(score, scoreIn(previous, key)),
      band: bandOf(score),
      evidence: splitEvidence(run?.dimensions[key]?.evidence ?? ""),
      history: runs.slice(0, index + 1).map((entry) => scoreIn(entry, key))
    };
  });
};

export const SORTS = ["number", "score", "change"] as const;
export type Sort = (typeof SORTS)[number];

/** By ledger order, by score (lowest first: the weakest needs you), or by change (drops first). */
export const sortRows = (rows: readonly DimensionRow[], sort: Sort): DimensionRow[] => {
  const low = (value: number | null): number => value ?? Number.POSITIVE_INFINITY;
  const byNumber = (left: DimensionRow, right: DimensionRow): number => left.number - right.number;
  if (sort === "score") {
    return [...rows].sort(
      (left, right) => low(left.score) - low(right.score) || byNumber(left, right)
    );
  }
  if (sort === "change") {
    return [...rows].sort(
      (left, right) => low(left.delta) - low(right.delta) || byNumber(left, right)
    );
  }
  return [...rows].sort(byNumber);
};

export const DISPOSITION_TONE: Readonly<Record<ScorecardDisposition, Tone>> = {
  regression: "danger",
  open: "warning",
  observed: "neutral",
  fixed: "success",
  wontfix: "neutral"
};

/** Dispositions that still ask for work. */
const OPEN_DISPOSITIONS: ReadonlySet<ScorecardDisposition> = new Set([
  "open",
  "observed",
  "regression"
]);

export const isOpenFinding = (finding: ScorecardFinding): boolean =>
  OPEN_DISPOSITIONS.has(finding.disposition);

/** A finding the run proposed for filing and that waits for the owner's go-ahead. */
export const isProposed = (finding: ScorecardFinding): boolean =>
  finding.reason?.startsWith("Proposed for filing") === true;

/** Slugs that are `fixed` in this run and were not `fixed` (or not recorded) in the previous one. */
export const fixedSince = (run: ScorecardRun, previous: ScorecardRun | undefined): string[] => {
  const before = new Map(previous?.findings.map((finding) => [finding.slug, finding.disposition]));
  return run.findings
    .filter((finding) => finding.disposition === "fixed" && before.get(finding.slug) !== "fixed")
    .map((finding) => finding.slug);
};

export interface RunSummary {
  readonly overall: number;
  readonly overallDelta: number | null;
  readonly up: number;
  readonly down: number;
  readonly held: number;
  readonly open: number;
  readonly regressions: number;
  readonly fixed: number;
}

export const summaryOf = (runs: readonly ScorecardRun[], index: number): RunSummary | null => {
  const run = runs[index];
  if (run === undefined) return null;
  const previous = runs[index - 1];
  const deltas = dimensionRows(runs, index).map((row) => row.delta);
  return {
    overall: run.overall,
    overallDelta: previous === undefined ? null : deltaOf(run.overall, previous.overall),
    up: deltas.filter((delta) => delta !== null && delta > 0).length,
    down: deltas.filter((delta) => delta !== null && delta < 0).length,
    held: deltas.filter((delta) => delta === 0).length,
    open: run.findings.filter(isOpenFinding).length,
    regressions: run.findings.filter((finding) => finding.disposition === "regression").length,
    fixed: fixedSince(run, previous).length
  };
};

export const FINDING_FILTERS = ["open", "fixed", "all"] as const;
export type FindingFilter = (typeof FINDING_FILTERS)[number];

/** How the findings table orders its rows. `rank` is the ledger's order. */
export const FINDING_SORTS = ["rank", "solved", "opened", "dimension", "state"] as const;
export type FindingSort = (typeof FINDING_SORTS)[number];

/** Each tracked issue by number. */
export type Tracking = ReadonlyMap<number, TrackedIssue>;

/** The issue a finding was filed as: its ledger number, else the issue a job filed for its slug. */
export const issueOf = (finding: ScorecardFinding, tracking: Tracking): TrackedIssue | null => {
  if (finding.issue !== undefined) return tracking.get(finding.issue) ?? null;
  for (const issue of tracking.values()) if (issue.slug === finding.slug) return issue;
  return null;
};

/** When a tracked issue was solved: it is closed, and a merged PR closed it. Else `null`. */
export const solvedAt = (issue: TrackedIssue | null): string | null =>
  issue !== null && issue.state === "closed" && issue.fix?.state === "merged"
    ? issue.fix.mergedAt
    : null;

/** A dimension's score in the last run before a day and in the first run after it. */
export interface ScoreDelta {
  readonly dimension: number;
  readonly before: number | null;
  readonly after: number | null;
  /** The date of the run after. */
  readonly afterDate: string;
}

/**
 * The finding's dimension in the last run before the merge day and the first run after it.
 * A run on the merge day itself may predate the merge, so it counts on neither side. `null`
 * until a run after the merge exists.
 */
export const scoreDelta = (
  runs: readonly ScorecardRun[],
  dimension: number,
  mergedAt: string
): ScoreDelta | null => {
  const day = mergedAt.slice(0, 10);
  const before = runs.filter((run) => run.date < day).at(-1);
  const after = runs.find((run) => run.date > day);
  if (after === undefined) return null;
  const scoreIn = (run: ScorecardRun | undefined): number | null =>
    run?.dimensions[String(dimension)]?.score ?? null;
  return { dimension, before: scoreIn(before), after: scoreIn(after), afterDate: after.date };
};

/** A finding whose issue a merged PR closed. */
export interface SolvedFinding {
  readonly finding: ScorecardFinding;
  readonly issue: TrackedIssue;
  readonly solvedAt: string;
  readonly delta: ScoreDelta | null;
}

/**
 * The findings of the run solved by a merged PR, newest merge first. The finding comes from the
 * latest run that names its slug, so a finding the next run dropped still shows.
 */
export const recentlySolved = (
  runs: readonly ScorecardRun[],
  tracking: Tracking,
  limit = 10
): SolvedFinding[] => {
  const latest = new Map<string, ScorecardFinding>();
  for (const run of runs) for (const finding of run.findings) latest.set(finding.slug, finding);
  return [...latest.values()]
    .flatMap((finding) => {
      const issue = issueOf(finding, tracking);
      const when = solvedAt(issue);
      return issue === null || when === null
        ? []
        : [{ finding, issue, solvedAt: when, delta: scoreDelta(runs, finding.dimension, when) }];
    })
    .sort((left, right) => right.solvedAt.localeCompare(left.solvedAt))
    .slice(0, limit);
};

export interface FindingsQuery {
  readonly filter: FindingFilter;
  /** Words to find in the slug or the title. */
  readonly search: string;
  /** One dimension, or `null` for all. */
  readonly dimension: number | null;
  readonly sort?: FindingSort;
  readonly tracking?: Tracking;
}

/** Newest first; a missing date last. */
const newestFirst = (left: string | null, right: string | null): number =>
  (right ?? "").localeCompare(left ?? "");

/** The findings that match, by ladder rank (the most severe first), and how many there are in all. */
export const findingsView = (
  run: ScorecardRun,
  query: FindingsQuery
): { readonly rows: readonly ScorecardFinding[]; readonly total: number } => {
  const words = query.search.trim().toLowerCase();
  const rows = run.findings
    .filter((finding) =>
      query.filter === "all"
        ? true
        : query.filter === "open"
          ? isOpenFinding(finding)
          : finding.disposition === "fixed"
    )
    .filter((finding) => query.dimension === null || finding.dimension === query.dimension)
    .filter(
      (finding) => words === "" || `${finding.slug} ${finding.title}`.toLowerCase().includes(words)
    )
    .sort((left, right) => {
      const tracking = query.tracking ?? new Map<number, TrackedIssue>();
      const byRank = left.ladderRank - right.ladderRank || left.slug.localeCompare(right.slug);
      switch (query.sort ?? "rank") {
        case "solved":
          return (
            newestFirst(solvedAt(issueOf(left, tracking)), solvedAt(issueOf(right, tracking))) ||
            byRank
          );
        case "opened":
          return (
            newestFirst(
              issueOf(left, tracking)?.createdAt ?? null,
              issueOf(right, tracking)?.createdAt ?? null
            ) || byRank
          );
        case "dimension":
          return left.dimension - right.dimension || byRank;
        case "state":
          return (
            SCORECARD_DISPOSITIONS.indexOf(left.disposition) -
              SCORECARD_DISPOSITIONS.indexOf(right.disposition) || byRank
          );
        case "rank":
          return byRank;
      }
    });
  return { rows, total: run.findings.length };
};

/** How many dimensions a run scored. The ledger says overalls compare only at the same count. */
export const scoredCount = (run: ScorecardRun): number =>
  Object.values(run.dimensions).filter((dimension) => dimension.score !== null).length;
