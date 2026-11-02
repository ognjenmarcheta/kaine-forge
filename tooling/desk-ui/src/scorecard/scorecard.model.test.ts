import type { ScorecardFinding, ScorecardRun } from "@repo/desk/contracts";
import { describe, expect, it } from "vitest";

import {
  bandOf,
  dimensionRows,
  findingsView,
  fixedSince,
  sortRows,
  splitEvidence,
  summaryOf
} from "./scorecard.model";

const finding = (slug: string, over: Partial<ScorecardFinding> = {}): ScorecardFinding => ({
  slug,
  title: `title of ${slug}`,
  dimension: 1,
  ladderRank: 5,
  disposition: "observed",
  ...over
});

const run = (over: Partial<ScorecardRun> = {}): ScorecardRun => ({
  date: "2026-11-02",
  commit: "34ca7e4cc",
  mode: "fan-out",
  agent: "claude",
  overall: 7.7,
  dimensions: {},
  findings: [],
  ...over
});

describe("bandOf", () => {
  it.each([
    [9, "top"],
    [8.9, "solid"],
    [7, "solid"],
    [5, "adequate"],
    [3, "weak"],
    [2.9, "absent"],
    [null, "unscored"]
  ] as const)("puts %s in %s", (score, band) => {
    expect(bandOf(score)).toBe(band);
  });
});

describe("splitEvidence", () => {
  it("splits the reasons after 'Not 9:' at each semicolon", () => {
    expect(
      splitEvidence("Boundaries exit 0. Not 9: the guide omits the rule; lists are hand-kept.")
    ).toEqual({
      summary: "Boundaries exit 0.",
      holdsBack: ["the guide omits the rule", "lists are hand-kept"]
    });
  });

  it("keeps text without a marker whole", () => {
    expect(splitEvidence("Everything is gated; nothing holds it back.")).toEqual({
      summary: "Everything is gated; nothing holds it back.",
      holdsBack: []
    });
  });
});

describe("findings", () => {
  const before = run({
    findings: [finding("a"), finding("b", { disposition: "fixed" }), finding("c")]
  });
  const now = run({
    findings: [
      finding("a", { disposition: "fixed", ladderRank: 2 }),
      finding("b", { disposition: "fixed" }),
      finding("c", { disposition: "regression", ladderRank: 3 }),
      finding("d", { ladderRank: 1, dimension: 4 })
    ]
  });

  it("shows the open work by default, the most severe first", () => {
    const view = findingsView(now, { filter: "open", search: "", dimension: null });
    expect(view.rows.map((row) => row.slug)).toEqual(["d", "c"]);
    expect(view.total).toBe(4);
  });

  it("narrows by dimension and by words of the slug or title", () => {
    expect(
      findingsView(now, { filter: "all", search: "", dimension: 4 }).rows.map((row) => row.slug)
    ).toEqual(["d"]);
    expect(
      findingsView(now, { filter: "all", search: "TITLE OF B", dimension: null }).rows.map(
        (row) => row.slug
      )
    ).toEqual(["b"]);
  });

  it("counts only findings that became fixed since the previous run", () => {
    expect(fixedSince(now, before)).toEqual(["a"]);
  });
});

describe("dimension rows and the summary", () => {
  const runs = [
    run({
      date: "2026-10-20",
      overall: 8,
      dimensions: { "1": { score: 8, evidence: "" }, "2": { score: 8, evidence: "" } }
    }),
    run({
      overall: 7.7,
      dimensions: { "1": { score: 7, evidence: "" }, "2": { score: 8, evidence: "" } },
      findings: [finding("x", { disposition: "regression" }), finding("y")]
    })
  ];

  it("gives each dimension its change and history, and sorts the biggest drop first", () => {
    const rows = sortRows(dimensionRows(runs, 1), "change");
    expect(rows[0]).toMatchObject({ number: 1, score: 7, delta: -1, history: [8, 7] });
    expect(rows[1]).toMatchObject({ number: 2, delta: 0 });
  });

  it("counts the moved dimensions and the open findings of the selected run", () => {
    expect(summaryOf(runs, 1)).toEqual({
      overall: 7.7,
      overallDelta: -0.3,
      up: 0,
      down: 1,
      held: 1,
      open: 2,
      regressions: 1,
      fixed: 0
    });
  });
});
