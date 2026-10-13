import { describe, expect, it } from "vitest";

import { parseJsonl } from "./stats.jsonl";
import { aggregateLessons } from "./stats.lessons";
import { lessonRecordSchema, type LessonRecord } from "../contracts";

const OLD = "a".repeat(64);
const NOW = "b".repeat(64);

const lesson = (over: Partial<LessonRecord> = {}): LessonRecord => ({
  schema: 1,
  at: "2026-10-13T09:00:00.000Z",
  issue: 12,
  role: "reviewer",
  source: "review",
  key: "review/Correctness/Consider",
  detail: "The export has no header row",
  file: "src/feature.ts",
  count: 1,
  repo: OLD,
  ...over
});

const aggregate = (records: readonly LessonRecord[], currentRepo: string | null = NOW) =>
  aggregateLessons({ records, invalidLines: 0 }, { currentRepo });

describe("aggregateLessons", () => {
  it("makes a key seen in two issues a candidate, and a key seen twice in one issue not", () => {
    const report = aggregate([
      lesson({ issue: 12 }),
      lesson({ issue: 15, at: "2026-10-14T09:00:00.000Z" }),
      lesson({ issue: 20, key: "check/pnpm lint", source: "check", count: 2 }),
      lesson({ issue: 20, key: "check/pnpm lint", source: "check" })
    ]);

    expect(report.candidates.map((candidate) => [candidate.key, candidate.issues])).toEqual([
      ["review/Correctness/Consider", [12, 15]]
    ]);
    expect(report.belowThreshold).toBe(1);
    expect(report.candidates[0]).toMatchObject({
      occurrences: 2,
      lastSeen: "2026-10-14T09:00:00.000Z",
      samples: [expect.objectContaining({ issue: 15 }), expect.objectContaining({ issue: 12 })]
    });
  });

  it("counts the times under the current instructions apart, so a fix that worked shows", () => {
    const report = aggregate([
      lesson({ issue: 12, repo: OLD, count: 3 }),
      lesson({ issue: 15, repo: OLD }),
      lesson({ issue: 18, repo: NOW }),
      lesson({ issue: 19, repo: null })
    ]);

    expect(report.candidates[0]).toMatchObject({ occurrences: 6, currentOccurrences: 1 });
    // Without a readable current hash, nothing counts as "now".
    expect(aggregate([lesson(), lesson({ issue: 13 })], null).candidates[0]).toMatchObject({
      currentOccurrences: 0
    });
  });

  it("orders the most widespread key first and keeps three samples, newest first", () => {
    const report = aggregate([
      ...[1, 2].map((issue) => lesson({ issue, key: "stuck/pnpm test", source: "stuck" })),
      ...[3, 4, 5, 6].map((issue) => lesson({ issue, at: `2026-10-1${issue}T09:00:00.000Z` }))
    ]);

    expect(report.candidates.map((candidate) => candidate.key)).toEqual([
      "review/Correctness/Consider",
      "stuck/pnpm test"
    ]);
    expect(report.candidates[0]?.samples.map((sample) => sample.issue)).toEqual([6, 5, 4]);
  });

  it("honours a higher threshold", () => {
    const records = [lesson({ issue: 1 }), lesson({ issue: 2 })];
    expect(aggregateLessons({ records, invalidLines: 0 }, { minIssues: 3 })).toMatchObject({
      candidates: [],
      belowThreshold: 1,
      minIssues: 3
    });
  });
});

describe("lessons.jsonl lines", () => {
  it("skips a torn line and a record with a key that carries no kind", () => {
    const text = [
      JSON.stringify(lesson()),
      '{"schema":1,"issue":',
      JSON.stringify({ ...lesson(), key: "" }),
      JSON.stringify(lesson({ issue: 13 }))
    ].join("\n");

    const parsed = parseJsonl(text, lessonRecordSchema);
    expect(parsed.records.map((record) => record.issue)).toEqual([12, 13]);
    expect(parsed.invalidLines).toBe(2);
  });
});
