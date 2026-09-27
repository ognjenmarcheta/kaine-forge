import { describe, expect, it } from "vitest";

import { codingRunSchema, summarizeCodingRuns, summarizeModelLogs } from "./run-report.util";

describe("local outcome reports", () => {
  it("counts failed and incomplete model runs, deduplicates ids and ignores other logs", () => {
    const good = JSON.stringify({
      runId: "a",
      provider: "openai",
      model: "test",
      status: "success",
      durationMs: 10,
      inputTokens: 3,
      outputTokens: 2,
      totalTokens: 5
    });
    const failed = JSON.stringify({
      runId: "b",
      provider: "deepseek",
      model: "test",
      status: "failure",
      durationMs: 30
    });
    expect(summarizeModelLogs([good, good, failed, "not-json"])).toEqual({
      runs: 2,
      ignored: 1,
      outcomes: { success: 1, failure: 1, cancelled: 0 },
      latencyMs: { median: 10, p95: 30 },
      availableTokens: { input: 3, output: 2, total: 5 },
      incompleteUsageRuns: 1
    });
  });
  it("does not claim a success rate with no reviewed runs", () => {
    expect(summarizeCodingRuns([])).toMatchObject({ runs: 0, acceptedFractionOfReviewed: null });
    expect(summarizeModelLogs([])).toMatchObject({
      runs: 0,
      latencyMs: { median: null, p95: null }
    });
  });
  it("keeps legacy runs visible and compares only complete matching configurations", () => {
    const legacy = codingRunSchema.parse({
      schemaVersion: 1,
      runId: "3f954f50-1783-41dc-b349-555667338002",
      workspace: "fixture",
      revision: "revision",
      model: "model",
      cliVersion: "cli",
      configurationHash: "policy",
      startedAt: "2026-09-27",
      durationMs: 100,
      exitCode: 0,
      termination: "completed",
      commands: [],
      transcript: null,
      outcome: "accepted",
      reviewMinutes: null,
      note: "reviewed"
    });
    const measured = {
      ...legacy,
      schemaVersion: 2 as const,
      runId: "3f954f50-1783-41dc-b349-555667338003",
      harness: "codex" as const,
      caseId: "query-key",
      mode: "edit" as const,
      instructionHash: "guide",
      toolHash: "tools",
      usage: { input_tokens: 10 },
      reviewMinutes: 2
    };
    const result = summarizeCodingRuns([legacy, measured, measured]);
    expect(result).toMatchObject({
      runs: 2,
      excludedFromComparisons: 1,
      accepted: 2,
      missingInputTokens: 1,
      missingOutputTokens: 2,
      availableTokens: { input: 10, output: null }
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ runs: 1, reviewMinutes: 2 });
    expect(
      summarizeCodingRuns([
        measured,
        { ...measured, runId: "3f954f50-1783-41dc-b349-555667338004", model: "different" }
      ]).groups
    ).toHaveLength(2);
  });
});
