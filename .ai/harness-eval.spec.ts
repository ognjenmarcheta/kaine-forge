import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  armMetric,
  armVerdicts,
  DATA_MARKER,
  GENERATED_MARKER,
  LEDGER_PATH,
  metricNames,
  parseLedger,
  renderLedgerMarkdown,
  type EvalRun
} from "./harness-eval";

const wrap = (json: string): string =>
  [
    `<!-- ${DATA_MARKER}:start -->`,
    "",
    "```json",
    json,
    "```",
    "",
    `<!-- ${DATA_MARKER}:end -->`,
    "",
    `<!-- ${GENERATED_MARKER}:start -->`,
    "",
    "placeholder",
    "",
    `<!-- ${GENERATED_MARKER}:end -->`
  ].join("\n");

const run: EvalRun = {
  date: "2026-09-11",
  commit: "abc1234",
  model: "claude-opus-5",
  agent: "claude",
  rule: "simplicity-ladder",
  conclusion: "effect",
  action: "keep",
  trials: [
    { arm: "with", verdict: 4, transcript: "t1", metrics: { netLines: 20, newFiles: 1 } },
    { arm: "with", verdict: 5, transcript: "t2", metrics: { netLines: 30, newFiles: 1 } },
    { arm: "without", verdict: 2, transcript: "t3", metrics: { netLines: 120, newFiles: 4 } },
    { arm: "without", verdict: 2, transcript: "t4", metrics: { netLines: 100, newFiles: 4 } }
  ]
};

describe("parseLedger", () => {
  it("reads the committed ledger", () => {
    const data = parseLedger(readFileSync(LEDGER_PATH, "utf8"));

    expect(Array.isArray(data.runs)).toBe(true);
  });

  it("treats an empty runs array as no runs", () => {
    expect(parseLedger(wrap('{ "schema": 1, "runs": [] }')).runs).toEqual([]);
  });

  it("round-trips a run", () => {
    const data = parseLedger(wrap(JSON.stringify({ schema: 1, runs: [run] })));

    expect(data.runs).toHaveLength(1);
    expect(data.runs[0]?.rule).toBe("simplicity-ladder");
    expect(data.runs[0]?.trials).toHaveLength(4);
  });

  it.each([
    ["a verdict outside 1-5", { ...run, trials: [{ ...run.trials[0], verdict: 9 }] }, /verdict/],
    ["an unknown arm", { ...run, trials: [{ ...run.trials[0], arm: "sideways" }] }, /arm/],
    ["an unknown action", { ...run, action: "ponder" }, /action/],
    [
      "a missing transcript",
      { ...run, trials: [{ ...run.trials[0], transcript: "" }] },
      /transcript/
    ],
    ["no trials", { ...run, trials: [] }, /trials/]
  ])("rejects %s", (_label, broken, pattern) => {
    expect(() => parseLedger(wrap(JSON.stringify({ schema: 1, runs: [broken] })))).toThrowError(
      pattern
    );
  });

  it("rejects a non-numeric metric", () => {
    const broken = { ...run, trials: [{ ...run.trials[0], metrics: { netLines: "lots" } }] };

    expect(() => parseLedger(wrap(JSON.stringify({ schema: 1, runs: [broken] })))).toThrowError(
      /finite number/
    );
  });
});

describe("arithmetic", () => {
  it("separates the arms", () => {
    expect(armVerdicts(run, "with")).toEqual([4, 5]);
    expect(armVerdicts(run, "without")).toEqual([2, 2]);
  });

  it("averages a metric per arm", () => {
    expect(armMetric(run, "with", "netLines")).toBe(25);
    expect(armMetric(run, "without", "netLines")).toBe(110);
  });

  it("collects metric names from both arms", () => {
    expect(metricNames(run)).toEqual(["netLines", "newFiles"]);
  });
});

describe("renderLedgerMarkdown", () => {
  it("prompts for a first run when the ledger is empty", () => {
    expect(renderLedgerMarkdown({ runs: [] })).toContain("No runs recorded yet");
  });

  it("reports the verdict delta and every metric delta", () => {
    const markdown = renderLedgerMarkdown({ runs: [run] });

    expect(markdown).toContain("4.50 with, 2 without (+2.50)");
    expect(markdown).toContain("| netLines | 25 | 110 | -85 |");
    expect(markdown).toContain("| newFiles | 1 | 4 | -3 |");
    expect(markdown).toContain("2 with / 2 without");
  });

  it("surfaces rules whose action is not keep, since those need a follow-up", () => {
    const markdown = renderLedgerMarkdown({
      runs: [{ ...run, action: "delete", conclusion: "no-effect" }]
    });

    expect(markdown).toContain("carry an action other than keep");
    expect(markdown).toContain("`simplicity-ladder` → delete");
  });

  it("says so plainly when every rule is a keep", () => {
    expect(renderLedgerMarkdown({ runs: [run] })).toContain("Every measured rule is marked keep");
  });
});
