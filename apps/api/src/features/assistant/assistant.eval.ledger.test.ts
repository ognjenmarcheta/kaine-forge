import { describe, expect, it } from "vitest";

import {
  appendEvalLedgerRun,
  findEvalRegressions,
  parseEvalLedger,
  readEvalLedger,
  summarizeEvalReport,
  type EvalLedgerRun
} from "./assistant.eval.ledger";
import {
  digest,
  reviewEvalResult,
  type EvalReport,
  type EvalResult
} from "./assistant.eval.report";

const run = (overrides: Partial<EvalLedgerRun>): EvalLedgerRun => ({
  runId: "6f1d2a64-3c1e-4c55-9d8a-1b2c3d4e5f60",
  date: "2026-10-19",
  revision: "c73ce99c0000000000000000000000000000abcd",
  provider: "openai",
  model: "model-a",
  datasetHash: digest("dataset-1"),
  promptHash: digest("prompt-1"),
  scheduled: 15,
  mechanicalPassed: 15,
  reviewPassed: 15,
  passed: 15,
  ...overrides
});

const second = "7a2e3b75-4d2f-4d66-8e9b-2c3d4e5f6071";

describe("committed assistant eval ledger", () => {
  it("parses and never regresses within a series", () => {
    expect(findEvalRegressions(readEvalLedger().runs)).toEqual([]);
  });
});

describe("findEvalRegressions", () => {
  it("flags a run that passes a lower share than the previous run in its series", () => {
    const regressions = findEvalRegressions([
      run({ passed: 14 }),
      run({ runId: second, passed: 13, promptHash: digest("prompt-2") })
    ]);

    expect(regressions).toHaveLength(1);
    expect(regressions[0]).toContain(`run ${second} passed 13/15, below 14/15`);
  });

  it.each([
    ["an equal score", run({ runId: second, passed: 14 })],
    ["a higher share at more repetitions", run({ runId: second, scheduled: 45, passed: 43 })],
    [
      "a lower score on a changed dataset",
      run({ runId: second, passed: 1, datasetHash: digest("d2") })
    ],
    ["a lower score on another model", run({ runId: second, passed: 1, model: "model-b" })]
  ])("accepts %s", (_label, next) => {
    expect(findEvalRegressions([run({ passed: 14 }), next])).toEqual([]);
  });
});

describe("appendEvalLedgerRun", () => {
  it("refuses a regressing or duplicate run and leaves the ledger unchanged", () => {
    const ledger = { schemaVersion: 1 as const, runs: [run({ passed: 14 })] };

    expect(() => appendEvalLedgerRun(ledger, run({ runId: second, passed: 10 }))).toThrow(
      "Not recorded"
    );
    expect(() => appendEvalLedgerRun(ledger, run({}))).toThrow("already recorded");
    expect(ledger.runs).toHaveLength(1);
  });

  it("rejects a run that carries anything beyond the summary fields", () => {
    const raw = JSON.stringify({ schemaVersion: 1, runs: [{ ...run({}), prompt: "Add milk" }] });

    expect(() => parseEvalLedger(raw)).toThrow();
  });
});

describe("summarizeEvalReport", () => {
  const result = (id: string, mechanical: "pass" | "fail"): EvalResult => ({
    id,
    caseId: "create-simple",
    repetition: 1,
    prompt: "synthetic prompt text",
    reply: "synthetic reply text",
    durationMs: 1,
    actions: [],
    checks: [],
    mechanical,
    reviewFlags: [],
    error: null,
    usage: {},
    before: {},
    after: {}
  });
  const report: EvalReport = {
    schemaVersion: 1,
    runId: "8b3f4c86-5e3a-4e77-9fac-3d4e5f607182",
    revision: "c73ce99c0000000000000000000000000000abcd",
    datasetHash: digest("dataset-1"),
    promptHash: digest("prompt-1"),
    provider: "deepseek",
    model: "model-a",
    startedAt: "2026-10-19T08:00:00.000Z",
    limits: { repeat: 1, steps: 8, outputTokens: 2048, caseMs: 60000, runMs: 900000, retries: 0 },
    scheduled: 3,
    complete: true,
    results: [
      result("9c4a5d97-6f4b-4f88-8abd-4e5f60718293", "pass"),
      result("ad5b6ea8-7a5c-4a99-9bce-5f60718293a4", "pass"),
      result("be6c7fb9-8b6d-4aaa-8cdf-60718293a4b5", "fail")
    ],
    reviews: []
  };
  const review = (input: EvalReport, resultId: string, verdict: "pass" | "fail") =>
    reviewEvalResult(input, { resultId, truthful: "pass", quality: verdict, note: "checked" });

  it("counts mechanical, human and combined passes and keeps no run content", () => {
    const [first, middle, last] = report.results.map((entry) => entry.id);
    if (!first || !middle || !last) throw new Error("fixture has three results");
    const reviewed = review(review(review(report, first, "pass"), middle, "fail"), last, "pass");

    const summary = summarizeEvalReport(reviewed);

    expect(summary).toMatchObject({
      date: "2026-10-19",
      scheduled: 3,
      mechanicalPassed: 2,
      reviewPassed: 2,
      passed: 1
    });
    expect(JSON.stringify(summary)).not.toContain("synthetic");
  });

  it("refuses a run with an unreviewed result or an incomplete run", () => {
    const [first] = report.results.map((entry) => entry.id);
    if (!first) throw new Error("fixture has results");

    expect(() => summarizeEvalReport(review(report, first, "pass"))).toThrow("Review result");
    expect(() => summarizeEvalReport({ ...report, complete: false })).toThrow("complete run");
  });
});
