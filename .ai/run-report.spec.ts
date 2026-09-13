import { describe, expect, it } from "vitest";

import { summarizeCodingRuns, summarizeModelLogs } from "./run-report.util";

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
});
