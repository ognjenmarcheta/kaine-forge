import path from "node:path";

import { readJsonl, type JsonlRecords } from "./stats.jsonl";
import {
  lessonRecordSchema,
  type LessonCandidate,
  type LessonRecord,
  type LessonReport,
  type PromotedLesson,
  type PromotedLessonStatus
} from "../contracts";
import { appendJsonl } from "../store/store.atomic";

/** In the state root, beside `runs.jsonl`, so `remove` keeps the observations. */
export const lessonsPath = (stateRoot: string): string => path.join(stateRoot, "lessons.jsonl");

/** The number of distinct issues that makes a key a candidate: the same problem seen twice. */
export const DEFAULT_MIN_ISSUES = 2;
const SAMPLE_LIMIT = 3;

export const appendLessonRecords = async (
  stateRoot: string,
  records: readonly LessonRecord[]
): Promise<void> => {
  for (const record of records) {
    await appendJsonl(lessonsPath(stateRoot), lessonRecordSchema.parse(record));
  }
};

export type LessonRecords = JsonlRecords<LessonRecord>;

export const readLessonRecords = (stateRoot: string): Promise<LessonRecords> =>
  readJsonl(lessonsPath(stateRoot), lessonRecordSchema);

export interface LessonOptions {
  readonly minIssues?: number;
  /** The `repo` instruction hash of the repository now. Splits the counts before and after a change. */
  readonly currentRepo?: string | null;
  /**
   * Lessons the owner promoted. Their keys leave the candidates and the count below the threshold;
   * the observations after a promotion count as the lesson coming back.
   */
  readonly promoted?: readonly PromotedLesson[];
}

const candidateOf = (
  records: readonly LessonRecord[],
  currentRepo: string | null
): LessonCandidate => {
  const newestFirst = [...records].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const [newest] = newestFirst;
  if (newest === undefined) throw new RangeError("A lesson candidate needs at least one record");
  const total = (list: readonly LessonRecord[]): number =>
    list.reduce((sum, record) => sum + record.count, 0);
  return {
    key: newest.key,
    source: newest.source,
    issues: [...new Set(records.map((record) => record.issue))].sort((a, b) => a - b),
    occurrences: total(records),
    currentOccurrences:
      currentRepo === null ? 0 : total(records.filter((record) => record.repo === currentRepo)),
    lastSeen: newest.at,
    samples: newestFirst
      .slice(0, SAMPLE_LIMIT)
      .map((record) => ({ issue: record.issue, detail: record.detail, file: record.file }))
  };
};

/** The observations of a promoted key made after its promotion. */
const recurrenceOf = (records: readonly LessonRecord[]): PromotedLessonStatus["recurrence"] => ({
  occurrences: records.reduce((sum, record) => sum + record.count, 0),
  issues: [...new Set(records.map((record) => record.issue))].sort((a, b) => a - b),
  lastSeen: records.reduce<string | null>(
    (last, record) => (last === null || record.at > last ? record.at : last),
    null
  )
});

/** Every observation of one key as a candidate, whatever its spread. `null` for an unseen key. */
export const lessonCandidateFor = (
  records: readonly LessonRecord[],
  key: string,
  currentRepo: string | null = null
): LessonCandidate | null => {
  const matching = records.filter((record) => record.key === key);
  return matching.length === 0 ? null : candidateOf(matching, currentRepo);
};

/**
 * Groups the observations by key. A key seen in at least `minIssues` distinct issues is a
 * candidate for `kaine-encode-knowledge`. Candidates come most widespread first, then newest.
 */
export const aggregateLessons = (
  { records, invalidLines }: LessonRecords,
  { minIssues = DEFAULT_MIN_ISSUES, currentRepo = null, promoted = [] }: LessonOptions = {}
): LessonReport => {
  const promotedAt = new Map(promoted.map((lesson) => [lesson.key, Date.parse(lesson.at)]));
  const byKey = new Map<string, LessonRecord[]>();
  const cameBack = new Map<string, LessonRecord[]>();
  for (const record of records) {
    const at = promotedAt.get(record.key);
    if (at === undefined) byKey.set(record.key, [...(byKey.get(record.key) ?? []), record]);
    else if (Date.parse(record.at) > at) {
      cameBack.set(record.key, [...(cameBack.get(record.key) ?? []), record]);
    }
  }
  const all = [...byKey.values()].map((group) => candidateOf(group, currentRepo));
  const candidates = all
    .filter((candidate) => candidate.issues.length >= minIssues)
    .sort(
      (a, b) =>
        b.issues.length - a.issues.length ||
        (a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : 0)
    );
  return {
    candidates,
    promoted: [...promoted]
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .map((lesson) => ({ ...lesson, recurrence: recurrenceOf(cameBack.get(lesson.key) ?? []) })),
    belowThreshold: all.length - candidates.length,
    minIssues,
    currentRepo,
    invalidLines
  };
};
