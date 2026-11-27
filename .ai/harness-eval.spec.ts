import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DATA_MARKER,
  GENERATED_MARKER,
  LEDGER_PATH,
  MIN_NOISE_FLOOR,
  noiseFloor,
  parseLedger,
  renderLedgerMarkdown,
  type Calibration,
  type CalibrationTrial,
  type EvalRun,
  type EvalTrial
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

  it("reads a blank data region as an empty ledger", () => {
    const blank = wrap("").replace(/```json\s*```/, "");

    expect(parseLedger(blank)).toEqual({ runs: [], calibrations: [] });
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

describe("conclusions backed by the arithmetic", () => {
  // first 4,4,4 and second 4,4,5: the arms differ by 1/3, so the floor is the 0.5 minimum.
  const calibration: Calibration = {
    id: "explorer-architecture",
    date: "2026-10-13",
    model: "claude-opus-5",
    agent: "claude",
    taskFamily: "architecture question",
    trials: [
      ...[4, 4, 4].map((verdict, index): CalibrationTrial => ({
        arm: "first",
        verdict,
        transcript: `a${index}`
      })),
      ...[4, 4, 5].map((verdict, index): CalibrationTrial => ({
        arm: "second",
        verdict,
        transcript: `b${index}`
      }))
    ]
  };
  const measured = (over: Partial<EvalRun>): string =>
    wrap(
      JSON.stringify({
        schema: 1,
        calibrations: [calibration],
        runs: [{ ...run, protocol: 2, calibration: calibration.id, ...over }]
      })
    );
  // with 4,4 and without 4,3: |Δ| = 0.5, exactly the floor.
  const close: EvalTrial[] = [
    { arm: "with", verdict: 4, transcript: "t1", metrics: {} },
    { arm: "with", verdict: 4, transcript: "t2", metrics: {} },
    { arm: "without", verdict: 4, transcript: "t3", metrics: {} },
    { arm: "without", verdict: 3, transcript: "t4", metrics: {} }
  ];

  it("accepts an effect above the noise floor and says where |Δ| falls", () => {
    const data = parseLedger(measured({}));

    expect(noiseFloor(calibration)).toBe(MIN_NOISE_FLOOR);
    expect(renderLedgerMarkdown(data)).toContain(
      "Noise floor 0.50 from calibration `explorer-architecture`: |Δ| 2.50 is above it."
    );
    expect(renderLedgerMarkdown(data)).toContain("### Calibrations");
  });

  it.each([
    ["an effect within the noise floor", { trials: close }, /within the noise floor/],
    [
      "no effect above the noise floor",
      { conclusion: "no-effect" as const },
      /above the noise floor/
    ],
    ["an unknown calibration", { calibration: "nowhere" }, /names no calibration/]
  ])("rejects %s", (_label, over, pattern) => {
    expect(() => parseLedger(measured(over))).toThrowError(pattern);
  });

  it("never lets an inconclusive run keep, delete or promote a rule, under any protocol", () => {
    const inconclusive = { ...run, conclusion: "inconclusive", action: "keep" };

    expect(() =>
      parseLedger(wrap(JSON.stringify({ schema: 1, runs: [inconclusive] })))
    ).toThrowError(/inconclusive, so its action cannot be keep/);
    expect(
      parseLedger(
        wrap(JSON.stringify({ schema: 1, runs: [{ ...inconclusive, action: "tighten" }] }))
      ).runs
    ).toHaveLength(1);
  });

  it("leaves a run without a protocol unchecked against a floor, as older runs were recorded", () => {
    const older = { ...run, trials: close };

    expect(parseLedger(wrap(JSON.stringify({ schema: 1, runs: [older] }))).runs).toHaveLength(1);
    expect(renderLedgerMarkdown({ runs: [older] })).not.toContain("Noise floor");
  });
});

describe("a protocol 3 run: problem, rationale and prediction", () => {
  const calibration: Calibration = {
    id: "ladder-task",
    date: "2026-11-27",
    model: "claude-opus-5",
    agent: "claude",
    taskFamily: "second notification channel",
    trials: [
      { arm: "first", verdict: 4, transcript: "a1" },
      { arm: "second", verdict: 4, transcript: "b1" }
    ]
  };
  const predicting: EvalRun = {
    ...run,
    protocol: 3,
    calibration: calibration.id,
    problem: "speculative-abstraction",
    rationale: "The ladder names the reuse rungs before new code.",
    predicted: { netLines: "down", newFiles: "up" }
  };
  const ledger = (over: Record<string, unknown>): string =>
    wrap(
      JSON.stringify({
        schema: 1,
        calibrations: [calibration],
        runs: [{ ...predicting, ...over }]
      })
    );

  it("checks each prediction against the sign of its metric delta", () => {
    // netLines falls by 85 as predicted. newFiles was predicted to rise and falls by 3.
    const markdown = renderLedgerMarkdown(parseLedger(ledger({})));

    expect(markdown).toContain(
      "Problem `speculative-abstraction`. Rationale: The ladder names the reuse rungs before new code."
    );
    expect(markdown).toContain(
      "Predicted: netLines down, newFiles up. Realized 1 of 2; missed: newFiles (Δ -3)."
    );
  });

  it.each([
    ["no problem", { problem: undefined }, /needs a problem/],
    ["a problem that is not a slug", { problem: "Speculative abstraction" }, /lowercase slug/],
    ["no rationale", { rationale: undefined }, /rationale/],
    ["no prediction", { predicted: undefined }, /predicted must name at least one metric/],
    ["an empty prediction", { predicted: {} }, /predicted must name at least one metric/],
    ["a direction that is not up or down", { predicted: { netLines: "less" } }, /up, down/],
    [
      "a predicted metric that no trial records",
      { predicted: { singleCallerAbstractions: "down" } },
      /no with trial records/
    ],
    [
      "a predicted metric that one arm does not record",
      {
        predicted: { netLines: "down" },
        trials: [
          { arm: "with", verdict: 5, transcript: "t1", metrics: { netLines: 20 } },
          { arm: "without", verdict: 2, transcript: "t2", metrics: {} }
        ]
      },
      /no without trial records/
    ],
    [
      "an effect within the noise floor, as a protocol 2 run",
      {
        trials: [
          { arm: "with", verdict: 4, transcript: "t1", metrics: { netLines: 20, newFiles: 1 } },
          { arm: "without", verdict: 4, transcript: "t2", metrics: { netLines: 90, newFiles: 4 } }
        ]
      },
      /within the noise floor/
    ]
  ])("rejects %s", (_label, over, pattern) => {
    expect(() => parseLedger(ledger(over))).toThrowError(pattern);
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

  it("lists the attempts at one problem together, oldest first, with what each predicted", () => {
    const markdown = renderLedgerMarkdown({
      runs: [
        { ...run, date: "2026-10-01", rule: "routing v1", problem: "stale-api-source" },
        { ...run, date: "2026-10-05", rule: "ladder", problem: "speculative-abstraction" },
        {
          ...run,
          date: "2026-10-20",
          rule: "routing v2",
          problem: "stale-api-source",
          predicted: { netLines: "down" }
        },
        { ...run, date: "2026-10-21", rule: "ungrouped" }
      ]
    });
    const index = markdown.slice(markdown.indexOf("### By problem"), markdown.indexOf("### 2026"));

    expect(index.split("\n").filter((line) => line.startsWith("| `"))).toEqual([
      "| `stale-api-source` | 2026-10-01 | `routing v1` | claude-opus-5 | effect | keep | none recorded |",
      "| `stale-api-source` | 2026-10-20 | `routing v2` | claude-opus-5 | effect | keep | realized 1 of 1 |",
      "| `speculative-abstraction` | 2026-10-05 | `ladder` | claude-opus-5 | effect | keep | none recorded |"
    ]);
  });

  it("says so plainly when every rule is a keep", () => {
    expect(renderLedgerMarkdown({ runs: [run] })).toContain("Every measured rule is marked keep");
  });
});
