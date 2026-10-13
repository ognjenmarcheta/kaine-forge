import { describe, expect, it } from "vitest";

import { aggregateRuns } from "./stats.aggregate";
import type { IssueSnapshot } from "./stats.aggregate";
import { parseRunRecords } from "./stats.runs";
import type { RunRecord } from "../contracts";

const record = (over: Partial<RunRecord> = {}): RunRecord => ({
  schema: 1,
  at: "2026-10-13T09:00:00.000Z",
  issue: 12,
  role: "builder",
  provider: "claude",
  model: "opus",
  isolation: "host",
  loops: { check: 0, review: 0 },
  durationMs: 60_000,
  ok: true,
  accepted: true,
  failureKind: null,
  usage: { inputTokens: 100, cachedInputTokens: 50, outputTokens: 10 },
  costUsd: 1,
  turns: 20,
  toolCalls: 30,
  editCalls: 4,
  failedToolCalls: 1,
  denials: 0,
  harness: null,
  ...over
});

const aggregate = (records: readonly RunRecord[], snapshots: readonly IssueSnapshot[]) =>
  aggregateRuns({ records, invalidLines: 0 }, snapshots);

describe("aggregateRuns", () => {
  it("groups runs by role, provider and model, in pipeline order", () => {
    const stats = aggregate(
      [
        record({ role: "reviewer", provider: "codex", model: null }),
        record({ model: "sonnet" }),
        record(),
        record({ role: "planner" })
      ],
      []
    );
    expect(
      stats.groups.map((group) => [group.role, group.provider, group.model, group.runs])
    ).toEqual([
      ["planner", "claude", "opus", 1],
      ["builder", "claude", "opus", 1],
      ["builder", "claude", "sonnet", 1],
      ["reviewer", "codex", null, 1]
    ]);
  });

  it("counts outcomes and averages only the runs that report a value", () => {
    const [group] = aggregate(
      [
        record({ durationMs: 10, costUsd: 1, turns: 10, editCalls: 2 }),
        record({ durationMs: 30, costUsd: 3, turns: null, editCalls: 6 }),
        record({
          durationMs: 1_000,
          ok: false,
          accepted: false,
          failureKind: "stuck",
          usage: null,
          costUsd: null,
          turns: null,
          editCalls: 10
        }),
        record({
          durationMs: 20,
          ok: false,
          accepted: false,
          failureKind: "timeout",
          usage: null,
          costUsd: null
        })
      ],
      []
    ).groups;
    expect(group).toMatchObject({
      runs: 4,
      accepted: 2,
      stuck: 1,
      timeouts: 1,
      medianDurationMs: 25,
      meanInputTokens: 150,
      totalCostUsd: 4,
      meanCostUsd: 2,
      meanTurns: 15,
      meanEditCalls: 5.5
    });
  });

  it("reports no cost for a provider that reports none (Codex)", () => {
    const [group] = aggregate(
      [record({ provider: "codex", costUsd: null, turns: null })],
      []
    ).groups;
    expect(group).toMatchObject({ totalCostUsd: null, meanCostUsd: null, meanTurns: null });
  });

  it("rolls up per issue and keeps the runs of a removed issue", () => {
    const stats = aggregate(
      [record({ issue: 3, costUsd: 2 }), record({ issue: 3, costUsd: 0.5 }), record({ issue: 9 })],
      [
        { issue: 3, stage: "pr-review", loops: { check: 1, review: 0 } },
        { issue: 5, stage: "plan-gate", loops: { check: 0, review: 0 } }
      ]
    );
    expect(stats.issues).toEqual([
      { issue: 3, stage: "pr-review", loops: { check: 1, review: 0 }, runs: 2, totalCostUsd: 2.5 },
      { issue: 5, stage: "plan-gate", loops: { check: 0, review: 0 }, runs: 0, totalCostUsd: null },
      { issue: 9, stage: null, loops: null, runs: 1, totalCostUsd: 1 }
    ]);
  });
});

describe("aggregateRuns by harness", () => {
  const harness = (repo: string) => ({
    repo: repo.repeat(64),
    desk: "d".repeat(64),
    head: "0".repeat(40)
  });

  it("splits a role into one row per instruction version, oldest first", () => {
    const records = [
      record({ harness: harness("a"), accepted: false }),
      record({ harness: null }),
      record({ harness: harness("b") }),
      record({ harness: harness("a"), accepted: false })
    ];
    const split = aggregateRuns({ records, invalidLines: 0 }, [], { byHarness: true });
    expect(split.groups.map((group) => [group.harness, group.runs, group.accepted])).toEqual([
      [{ repo: "a".repeat(12), desk: "d".repeat(12) }, 2, 0],
      [null, 1, 1],
      [{ repo: "b".repeat(12), desk: "d".repeat(12) }, 1, 1]
    ]);
    // Without the option the same runs stay one row, with no harness named.
    expect(aggregate(records, []).groups).toEqual([
      expect.objectContaining({ runs: 4, accepted: 2, harness: null })
    ]);
  });
});

describe("aggregateRuns with skipped lines", () => {
  it("passes the count of skipped lines through", () => {
    expect(aggregateRuns({ records: [], invalidLines: 3 }, []).invalidLines).toBe(3);
  });
});

describe("parseRunRecords", () => {
  it("keeps valid lines and counts torn or unknown ones", () => {
    const text = [
      JSON.stringify(record()),
      '{"schema":1,"issue":',
      JSON.stringify({ ...record(), schema: 2 }),
      "",
      JSON.stringify(record({ issue: 4 }))
    ].join("\n");
    const parsed = parseRunRecords(text);
    expect(parsed.records.map((entry) => entry.issue)).toEqual([12, 4]);
    expect(parsed.invalidLines).toBe(2);
  });

  it("reads a line written before the harness field existed as harness null", () => {
    const older = JSON.stringify(record(), (key, value: unknown) =>
      key === "harness" ? undefined : value
    );
    const parsed = parseRunRecords(older);
    expect(parsed.records).toEqual([expect.objectContaining({ issue: 12, harness: null })]);
    expect(parsed.invalidLines).toBe(0);
  });
});
