import { describe, expect, it } from "vitest";

import type { ScorecardJobResult, ScorecardRun } from "../contracts";
import { appendScorecardRun, LedgerWriteError, ledgerRun, overallOf } from "./jobs.scorecard";
import { readCalibration } from "../scorecard/scorecard.read";

const run = (over: Partial<ScorecardRun> = {}): ScorecardRun => ({
  date: "2026-10-20",
  commit: "9cf8364f919d60c402691d317959ae5ddec85a8b",
  mode: "fan-out",
  agent: "claude",
  overall: 8,
  dimensions: { "1": { score: 8, evidence: "boundaries exit 0" } },
  findings: [],
  ...over
});

const ledger = (runs: readonly ScorecardRun[]): string =>
  [
    "# Monorepo Health Scorecard",
    "",
    "<!-- scorecard:data:start -->",
    "",
    "```json",
    JSON.stringify({ schema: 1, runs, authoredFlows: [], note: "kept" }, null, 2),
    "```",
    "",
    "<!-- scorecard:data:end -->",
    "",
    "## Calibration notes",
    "",
    "### 2026-10-20 — ninth run (`9cf8364`, fan-out)",
    "",
    "- Earlier note."
  ].join("\n");

const result = (over: Partial<ScorecardRun> = {}): ScorecardJobResult => ({
  summary: "Scored.",
  run: run({
    date: "1999-01-01",
    commit: "not-a-sha",
    agent: "whatever",
    overall: 9.9,
    dimensions: {
      "1": { score: 7, evidence: "a" },
      "2": { score: 8, evidence: "b" },
      "3": { score: null, evidence: "unscored" }
    },
    ...over
  }),
  calibration: ["Dim 1 → 7 with cause."],
  proposedIssues: [],
  openQuestions: [],
  plainLanguage: "Plain."
});

describe("ledgerRun", () => {
  it("keeps the engine's facts and the mean of the scored dimensions over the scorer's", () => {
    expect(ledgerRun(result(), { date: "2026-11-02", head: "a".repeat(40) })).toMatchObject({
      date: "2026-11-02",
      commit: "a".repeat(40),
      mode: "fan-out",
      agent: "desk-job",
      overall: 7.5
    });
    expect(overallOf({ dimensions: {} })).toBe(0);
  });
});

describe("appendScorecardRun", () => {
  it("appends the run, keeps unknown fields, and adds the notes under the run's short commit", () => {
    const next = run({ date: "2026-11-02", commit: "34ca7e4" + "c".repeat(33), overall: 7.7 });

    const written = appendScorecardRun(ledger([run()]), next, ["Dim 7 → 8.", "Dim 6 → 8."], 3);

    const data = JSON.parse(/```json\n([\s\S]*?)```/.exec(written)?.[1] ?? "");
    expect(data.runs.map((entry: ScorecardRun) => entry.date)).toEqual([
      "2026-10-20",
      "2026-11-02"
    ]);
    expect(data.note).toBe("kept");
    expect(readCalibration(written)).toEqual({
      "9cf8364": ["Earlier note."],
      "34ca7e4": ["Dim 7 → 8.", "Dim 6 → 8."]
    });
    expect(written).toContain("### 2026-11-02 — desk job 3 (`34ca7e4`, fan-out)");
  });

  it("keeps the notes inside the calibration section when a section follows it", () => {
    const next = run({ date: "2026-11-02", commit: "34ca7e4" + "c".repeat(33) });

    const written = appendScorecardRun(
      `${ledger([run()])}\n\n## Appendix\n\nLater text.\n`,
      next,
      ["Dim 7 → 8."],
      3
    );

    expect(readCalibration(written)["34ca7e4"]).toEqual(["Dim 7 → 8."]);
    expect(written.trimEnd().endsWith("## Appendix\n\nLater text.")).toBe(true);
  });

  it("refuses a ledger without its data block", () => {
    expect(() => appendScorecardRun("# no data", run(), [], 1)).toThrow(LedgerWriteError);
  });
});
