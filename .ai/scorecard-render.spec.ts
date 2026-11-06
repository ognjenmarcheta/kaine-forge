import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DATA_MARKER,
  GENERATED_MARKER,
  LEDGER_PATH,
  parseLedger,
  renderLedgerMarkdown,
  type LedgerData,
  type ScorecardRun
} from "./scorecard.util";

const ledgerFixture = (json: string): string =>
  [
    "# Scorecard",
    "",
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
    "_placeholder_",
    "",
    `<!-- ${GENERATED_MARKER}:end -->`,
    ""
  ].join("\n");

const emptyData: LedgerData = { schema: 1, runs: [], authoredFlows: [] };

const run = (overrides: Partial<ScorecardRun> = {}): ScorecardRun => ({
  date: "2026-07-27",
  commit: "abcdef1234567890",
  mode: "fan-out",
  agent: "claude",
  overall: 8.2,
  dimensions: {
    "1": { score: 8, evidence: "turbo boundaries clean" },
    "3": { score: null, evidence: "gh unavailable" }
  },
  findings: [
    {
      slug: "ci-duplicate-test-run",
      title: "ci: the test suite executes twice on every code PR",
      dimension: 3,
      ladderRank: 7,
      disposition: "open",
      issue: 143
    }
  ],
  ...overrides
});

describe("parseLedger", () => {
  it("parses the tracked ledger without throwing", () => {
    const data = parseLedger(readFileSync(LEDGER_PATH, "utf8"));

    expect(data.schema).toBe(1);
    expect(data.authoredFlows.length).toBeGreaterThan(0);
    expect(Array.isArray(data.runs)).toBe(true);
  });

  it("reads runs, dimensions, and findings", () => {
    const data = parseLedger(ledgerFixture(JSON.stringify({ ...emptyData, runs: [run()] })));

    expect(data.runs).toHaveLength(1);
    expect(data.runs[0]?.dimensions["1"]?.score).toBe(8);
    expect(data.runs[0]?.dimensions["3"]?.score).toBeNull();
    expect(data.runs[0]?.findings[0]?.slug).toBe("ci-duplicate-test-run");
  });

  it("rejects a run with an unknown mode", () => {
    const bad = JSON.stringify({ ...emptyData, runs: [{ ...run(), mode: "guess" }] });

    expect(() => parseLedger(ledgerFixture(bad))).toThrow(/expected "fan-out" or "sequential"/);
  });
});

describe("renderLedgerMarkdown", () => {
  it("renders an empty-state line when there are no runs", () => {
    expect(renderLedgerMarkdown(emptyData)).toContain("No runs recorded yet");
  });

  it("renders history, scores, and findings for the latest run", () => {
    const markdown = renderLedgerMarkdown({ ...emptyData, runs: [run()] });

    expect(markdown).toContain("GENERATED REGION");
    expect(markdown).toContain("### Run history");
    expect(markdown).toContain("### Latest scorecard");
    expect(markdown).toContain("Workspace & Boundaries");
    expect(markdown).toContain("unscored");
    expect(markdown).toContain("| 10 | AI & Agent Quality | unscored |");
    expect(markdown).toContain("| **8.2** | 1 | 1 |");
    expect(markdown).toContain("`ci-duplicate-test-run`");
    expect(markdown).toContain("#143");
  });

  it("shows a delta against the previous run", () => {
    const markdown = renderLedgerMarkdown({
      ...emptyData,
      runs: [
        run({ date: "2026-07-01", overall: 7.5, dimensions: { "1": { score: 7, evidence: "x" } } }),
        run({ date: "2026-07-27", overall: 8.2, dimensions: { "1": { score: 8, evidence: "y" } } })
      ]
    });

    expect(markdown).toContain("▲+1");
    expect(markdown).toContain("2026-07-01");
  });
});
