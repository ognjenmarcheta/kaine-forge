import type { ScorecardFinding, ScorecardRun, TrackedIssue } from "@repo/desk/contracts";
import { describe, expect, it } from "vitest";

import {
  bandOf,
  dimensionRows,
  findingsView,
  fixedSince,
  recentlySolved,
  scoreDelta,
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

const tracked = (number: number, over: Partial<TrackedIssue> = {}): TrackedIssue => ({
  number,
  title: `Issue ${String(number)}`,
  url: `https://github.com/o/r/issues/${String(number)}`,
  state: "open",
  createdAt: "2026-11-01T10:00:00Z",
  closedAt: null,
  labeled: true,
  slug: null,
  fix: null,
  run: null,
  ...over
});
const merged = (number: number, mergedAt: string): Partial<TrackedIssue> => ({
  state: "closed",
  closedAt: mergedAt,
  fix: { number: number + 100, url: "https://github.com/o/r/pull/1", state: "merged", mergedAt }
});

describe("scoreDelta", () => {
  const runs = [
    run({ date: "2026-11-01", dimensions: { "9": { score: 6, evidence: "" } } }),
    run({ date: "2026-11-05", dimensions: { "9": { score: 6, evidence: "" } } }),
    run({ date: "2026-11-09", dimensions: { "9": { score: 8, evidence: "" } } })
  ];

  it("compares the last run before the merge day with the first run after it", () => {
    expect(scoreDelta(runs, 9, "2026-11-05T15:00:00Z")).toEqual({
      dimension: 9,
      before: 6,
      after: 8,
      afterDate: "2026-11-09"
    });
  });

  it("shows nothing until a run after the merge exists", () => {
    expect(scoreDelta(runs, 9, "2026-11-10T09:00:00Z")).toBeNull();
  });
});

describe("recentlySolved", () => {
  it("lists findings whose issue a merged PR closed, newest merge first, by number or by slug", () => {
    const runs = [
      run({
        findings: [
          finding("by-number", { issue: 846 }),
          finding("by-slug"),
          finding("still-open", { issue: 848 }),
          finding("closed-no-pr", { issue: 849 })
        ]
      })
    ];
    const tracking = new Map([
      [846, tracked(846, merged(846, "2026-11-03T10:00:00Z"))],
      [847, tracked(847, { slug: "by-slug", ...merged(847, "2026-11-04T10:00:00Z") })],
      [848, tracked(848)],
      [849, tracked(849, { state: "closed", closedAt: "2026-11-04T10:00:00Z" })]
    ]);

    expect(recentlySolved(runs, tracking).map((entry) => entry.finding.slug)).toEqual([
      "by-slug",
      "by-number"
    ]);
  });
});

describe("findingsView sorts", () => {
  const solvedRun = run({
    findings: [
      finding("a", { ladderRank: 1, issue: 1 }),
      finding("b", { ladderRank: 2, issue: 2 }),
      finding("c", { ladderRank: 3 })
    ]
  });
  const tracking = new Map([
    [1, tracked(1, { createdAt: "2026-10-01T00:00:00Z", ...merged(1, "2026-11-01T00:00:00Z") })],
    [2, tracked(2, { createdAt: "2026-10-05T00:00:00Z", ...merged(2, "2026-11-02T00:00:00Z") })]
  ]);
  const order = (sort: "solved" | "opened") =>
    findingsView(solvedRun, {
      filter: "all",
      search: "",
      dimension: null,
      sort,
      tracking
    }).rows.map((row) => row.slug);

  it("puts the newest solved first, and a finding without an issue last", () => {
    expect(order("solved")).toEqual(["b", "a", "c"]);
  });

  it("puts the newest opened issue first", () => {
    expect(order("opened")).toEqual(["b", "a", "c"]);
  });
});
