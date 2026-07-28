import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./ai.util";
import {
  DATA_MARKER,
  deriveCiFlow,
  deriveWorkspaceFlow,
  extractRegion,
  GENERATED_MARKER,
  layoutFlow,
  LEDGER_PATH,
  parseLedger,
  readWorkflowJobs,
  renderDashboardHtml,
  renderLedgerMarkdown,
  replaceRegion,
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
    expect(data.authoredFlows.map((flow) => flow.id)).toEqual([
      "release-deploy",
      "runtime-request"
    ]);
    expect(Array.isArray(data.runs)).toBe(true);
  });

  it("reads runs, dimensions, and findings", () => {
    const data = parseLedger(ledgerFixture(JSON.stringify({ ...emptyData, runs: [run()] })));

    expect(data.runs).toHaveLength(1);
    expect(data.runs[0]?.dimensions["1"]?.score).toBe(8);
    expect(data.runs[0]?.dimensions["3"]?.score).toBeNull();
    expect(data.runs[0]?.findings[0]?.slug).toBe("ci-duplicate-test-run");
  });

  it("rejects a missing data marker", () => {
    expect(() => parseLedger("# Scorecard\n\nno markers here\n")).toThrow(
      /missing the scorecard:data marker/
    );
  });

  it("rejects invalid JSON with the marker name in the message", () => {
    expect(() => parseLedger(ledgerFixture("{ not json"))).toThrow(
      /scorecard:data JSON is invalid/
    );
  });

  it("rejects a run with an unknown mode", () => {
    const bad = JSON.stringify({ ...emptyData, runs: [{ ...run(), mode: "guess" }] });

    expect(() => parseLedger(ledgerFixture(bad))).toThrow(/expected "fan-out" or "sequential"/);
  });
});

describe("replaceRegion", () => {
  it("replaces only the generated region and leaves the data block intact", () => {
    const raw = ledgerFixture(JSON.stringify(emptyData));
    const updated = replaceRegion(raw, GENERATED_MARKER, "fresh body");

    expect(extractRegion(updated, GENERATED_MARKER)).toContain("fresh body");
    expect(extractRegion(updated, GENERATED_MARKER)).not.toContain("_placeholder_");
    expect(extractRegion(updated, DATA_MARKER)).toBe(extractRegion(raw, DATA_MARKER));
  });

  it("is idempotent, so a second render produces no diff", () => {
    const raw = ledgerFixture(JSON.stringify(emptyData));
    const once = replaceRegion(raw, GENERATED_MARKER, "stable body");
    const twice = replaceRegion(once, GENERATED_MARKER, "stable body");

    expect(twice).toBe(once);
  });

  it("throws when the marker pair is absent", () => {
    expect(() => replaceRegion("# nothing\n", GENERATED_MARKER, "body")).toThrow(
      /missing the scorecard:generated marker/
    );
  });
});

describe("deriveWorkspaceFlow", () => {
  it("builds edges from dependency to dependent and drops external deps", () => {
    const flow = deriveWorkspaceFlow([
      { name: "@repo/ui", dir: "packages/ui", internalDependencies: [] },
      { name: "@repo/web", dir: "apps/web", internalDependencies: ["@repo/ui", "react"] }
    ]);

    expect(flow.nodes.map((node) => node.label)).toEqual(["ui", "web"]);
    expect(flow.nodes.map((node) => node.group)).toEqual(["packages", "apps"]);
    expect(flow.edges).toEqual([{ from: "@repo/ui", to: "@repo/web" }]);
  });
});

describe("readWorkflowJobs and deriveCiFlow", () => {
  it("derives a job DAG from workflow needs", () => {
    const dir = mkdtempSync(join(tmpdir(), "scorecard-workflows-"));
    try {
      writeFileSync(
        join(dir, "ci.yml"),
        [
          "name: CI PR",
          "on: pull_request",
          "jobs:",
          "  detect:",
          "    name: Detect Changed Paths",
          "  check:",
          "    name: Check Fast",
          "    needs: [detect]",
          "  e2e:",
          "    needs: check"
        ].join("\n")
      );

      const jobs = readWorkflowJobs(dir);
      const flow = deriveCiFlow(jobs);

      expect(jobs).toHaveLength(3);
      expect(flow.nodes.map((node) => node.label)).toEqual([
        "Detect Changed Paths",
        "Check Fast",
        "e2e"
      ]);
      expect(flow.nodes.every((node) => node.group === "CI PR")).toBe(true);
      expect(flow.edges).toEqual([
        { from: "ci.yml:detect", to: "ci.yml:check" },
        { from: "ci.yml:check", to: "ci.yml:e2e" }
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns no jobs for a missing directory", () => {
    expect(readWorkflowJobs(join(tmpdir(), "scorecard-does-not-exist"))).toEqual([]);
  });

  it("ignores a workflow file with no jobs block", () => {
    const dir = mkdtempSync(join(tmpdir(), "scorecard-workflows-"));
    try {
      writeFileSync(join(dir, "empty.yml"), "name: Nothing\non: push\n");
      expect(readWorkflowJobs(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("layoutFlow", () => {
  it("places each node one layer right of its dependency", () => {
    const layout = layoutFlow({
      id: "t",
      title: "t",
      caption: "t",
      nodes: [
        { id: "a", label: "a" },
        { id: "b", label: "b" },
        { id: "c", label: "c" }
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" }
      ]
    });

    const xOf = (id: string): number => layout.nodes.find((node) => node.id === id)?.x ?? -1;

    expect(xOf("a")).toBeLessThan(xOf("b"));
    expect(xOf("b")).toBeLessThan(xOf("c"));
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it("terminates on a cyclic graph instead of spinning", () => {
    const layout = layoutFlow({
      id: "t",
      title: "t",
      caption: "t",
      nodes: [
        { id: "a", label: "a" },
        { id: "b", label: "b" }
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "a" }
      ]
    });

    expect(layout.nodes).toHaveLength(2);
  });

  it("splits a multi-line label into separate lines", () => {
    const layout = layoutFlow({
      id: "t",
      title: "t",
      caption: "t",
      nodes: [{ id: "a", label: "first\nsecond" }],
      edges: []
    });

    expect(layout.nodes[0]?.lines).toEqual(["first", "second"]);
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

describe("renderDashboardHtml", () => {
  const flows = [
    {
      id: "sample",
      title: "Sample flow",
      caption: "caption",
      nodes: [
        { id: "a", label: "A", group: "one" },
        { id: "b", label: "B", group: "two" }
      ],
      edges: [{ from: "a", to: "b", label: "edge" }]
    }
  ];

  it("emits a self-contained document with no external requests", () => {
    const html = renderDashboardHtml({ ...emptyData, runs: [run()] }, flows);

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\ssrc=/);
    expect(html).not.toMatch(/<link\b/i);
  });

  it("renders a card per dimension and the supplied flows", () => {
    const html = renderDashboardHtml({ ...emptyData, runs: [run()] }, flows);

    expect(html).toContain("Docs &amp; Agent Scaffolding");
    expect(html).toContain("Sample flow");
    expect(html).toContain("<svg");
    expect(html).toContain("#143");
  });

  it("sizes each diagram explicitly so wide flows scroll instead of shrinking to unreadable text", () => {
    const html = renderDashboardHtml(emptyData, flows);
    const svg = /<svg class="flow" width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/.exec(
      html
    );

    expect(svg).not.toBeNull();
    expect(svg?.[1]).toBe(svg?.[3]);
    expect(svg?.[2]).toBe(svg?.[4]);
    expect(html).toContain(".flow{display:block;max-width:none}");
  });

  it("renders an empty state when no runs exist", () => {
    const html = renderDashboardHtml(emptyData, flows);

    expect(html).toContain("No runs recorded yet");
    expect(html).toContain("Sample flow");
  });

  it("escapes untrusted text rather than injecting markup", () => {
    const hostile = run();
    const html = renderDashboardHtml(
      {
        ...emptyData,
        runs: [
          {
            ...hostile,
            findings: hostile.findings.map((finding) => ({ ...finding, title: "<img onerror=x>" }))
          }
        ]
      },
      flows
    );

    expect(html).toContain("&lt;img onerror=x&gt;");
    expect(html).not.toContain("<img onerror=x>");
  });

  it("draws a trend line once there are at least two runs", () => {
    const single = renderDashboardHtml({ ...emptyData, runs: [run()] }, flows);
    const paired = renderDashboardHtml(
      { ...emptyData, runs: [run({ date: "2026-07-01" }), run()] },
      flows
    );

    expect(single).not.toContain("Overall trend");
    expect(paired).toContain("Overall trend");
  });
});

describe("scorecard output directory", () => {
  it("is ignored by git and docker so it is never committed", () => {
    expect(readFileSync(join(REPO_ROOT, ".gitignore"), "utf8")).toMatch(/^scorecard-out\/$/m);
    expect(readFileSync(join(REPO_ROOT, ".dockerignore"), "utf8")).toMatch(/^scorecard-out\/$/m);
  });
});
