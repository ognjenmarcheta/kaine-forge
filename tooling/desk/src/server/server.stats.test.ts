import { afterEach, describe, expect, it } from "vitest";

import {
  issueDetailSchema,
  lessonReportSchema,
  runStatsSchema,
  type RunRecord
} from "../contracts";
import { authenticated, createHarness, raw, type Harness } from "./server.testing";

let harness: Harness | null = null;
afterEach(async () => {
  await harness?.cleanup();
  harness = null;
});

const record = (over: Partial<RunRecord> = {}): RunRecord => ({
  schema: 1,
  at: "2026-10-13T09:00:00.000Z",
  issue: 3,
  role: "builder",
  provider: "claude",
  model: "opus",
  isolation: "host",
  loops: { check: 0, review: 0 },
  durationMs: 60_000,
  ok: true,
  accepted: true,
  failureKind: null,
  usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 10 },
  costUsd: 1,
  turns: 12,
  toolCalls: 20,
  editCalls: 2,
  failedToolCalls: 0,
  denials: 0,
  harness: null,
  ...over
});

const RECORDS = [
  record(),
  record({ issue: 8, role: "reviewer", provider: "codex", costUsd: null })
];

describe("GET /api/stats", () => {
  it("groups the runs and joins each issue with its stage", async () => {
    harness = await createHarness({
      readRuns: () => Promise.resolve({ records: RECORDS, invalidLines: 1 })
    });
    await harness.seed(3, { stage: "pr-review" });
    const api = await authenticated(harness);

    const reply = await api.get("/api/stats");

    expect(reply.status).toBe(200);
    const stats = runStatsSchema.parse(reply.json());
    expect(stats.groups.map((group) => [group.role, group.provider, group.runs])).toEqual([
      ["builder", "claude", 1],
      ["reviewer", "codex", 1]
    ]);
    expect(stats.issues.map((issue) => [issue.issue, issue.stage])).toEqual([
      [3, "pr-review"],
      [8, null]
    ]);
    expect(stats.invalidLines).toBe(1);
  });

  it("answers with empty stats when the runtime has no run record", async () => {
    harness = await createHarness();
    const api = await authenticated(harness);
    expect(runStatsSchema.parse((await api.get("/api/stats")).json())).toEqual({
      groups: [],
      issues: [],
      invalidLines: 0
    });
  });

  it("needs a session", async () => {
    harness = await createHarness();
    expect((await raw(harness.desk, { path: "/api/stats" })).status).toBe(401);
  });
});

describe("GET /api/lessons", () => {
  it("answers with the runtime's report, an empty one without it, and only with a session", async () => {
    const report = {
      candidates: [],
      belowThreshold: 4,
      minIssues: 2,
      currentRepo: "c".repeat(64),
      invalidLines: 0
    };
    harness = await createHarness({ lessons: () => Promise.resolve(report) });
    const api = await authenticated(harness);
    expect(lessonReportSchema.parse((await api.get("/api/lessons")).json())).toEqual(report);
    expect((await raw(harness.desk, { path: "/api/lessons" })).status).toBe(401);
    await harness.cleanup();

    harness = await createHarness();
    const bare = await authenticated(harness);
    expect(lessonReportSchema.parse((await bare.get("/api/lessons")).json())).toMatchObject({
      candidates: [],
      belowThreshold: 0
    });
  });
});

describe("GET /api/issues/:n runs", () => {
  it("carries only the runs of that issue", async () => {
    harness = await createHarness({
      readRuns: () => Promise.resolve({ records: RECORDS, invalidLines: 0 })
    });
    await harness.seed(3);
    const api = await authenticated(harness);

    const detail = issueDetailSchema.parse((await api.get("/api/issues/3")).json());

    expect(detail.runs).toEqual([record()]);
  });
});
