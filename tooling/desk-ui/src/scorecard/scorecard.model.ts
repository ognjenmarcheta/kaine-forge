import {
  SCORECARD_DIMENSIONS,
  type ScorecardDisposition,
  type ScorecardFinding,
  type ScorecardRun
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

export interface FindingsQuery {
  readonly filter: FindingFilter;
  /** Words to find in the slug or the title. */
  readonly search: string;
  /** One dimension, or `null` for all. */
  readonly dimension: number | null;
}

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
    .sort(
      (left, right) => left.ladderRank - right.ladderRank || left.slug.localeCompare(right.slug)
    );
  return { rows, total: run.findings.length };
};

/** How many dimensions a run scored. The ledger says overalls compare only at the same count. */
export const scoredCount = (run: ScorecardRun): number =>
  Object.values(run.dimensions).filter((dimension) => dimension.score !== null).length;
