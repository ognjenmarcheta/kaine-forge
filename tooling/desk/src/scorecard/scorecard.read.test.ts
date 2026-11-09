import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { SCORECARD_DIMENSIONS, scorecardViewSchema } from "../contracts";
import { githubRepository, parseScorecardLedger, readScorecard } from "./scorecard.read";

let root: string | null = null;
afterEach(async () => {
  if (root !== null) await rm(root, { recursive: true, force: true });
  root = null;
});

const run = (date: string, commit: string, overall: number) => ({
  date,
  commit,
  mode: "fan-out",
  agent: "claude",
  overall,
  dimensions: { "1": { score: overall, evidence: `Evidence of ${date}` } },
  findings: []
});

const ledger = (data: string, notes = ""): string =>
  [
    "# Monorepo Health Scorecard",
    "<!-- scorecard:data:start -->",
    "```json",
    data,
    "```",
    "<!-- scorecard:data:end -->",
    "## Calibration notes",
    notes
  ].join("\n");

/** A checkout with a ledger, two packages where `b` depends on `a`, and one workflow. */
const checkout = async (ledgerText: string | null): Promise<string> => {
  root = await mkdtemp(path.join(tmpdir(), "desk-scorecard-"));
  const write = async (file: string, text: string): Promise<void> => {
    await mkdir(path.dirname(path.join(root ?? "", file)), { recursive: true });
    await writeFile(path.join(root ?? "", file), text);
  };
  await write("packages/a/package.json", JSON.stringify({ name: "@repo/a" }));
  await write(
    "packages/b/package.json",
    JSON.stringify({ name: "@repo/b", dependencies: { "@repo/a": "workspace:*", zod: "1" } })
  );
  await write(
    ".github/workflows/ci.yml",
    "name: CI\njobs:\n  fast:\n    name: Check Fast\n  gate:\n    needs: fast\n"
  );
  if (ledgerText !== null) await write("docs/agents/monorepo-scorecard.md", ledgerText);
  return root;
};

describe("readScorecard", () => {
  it("returns the runs oldest first with each run's notes and the laid-out diagrams", async () => {
    const data = JSON.stringify({
      schema: 1,
      runs: [run("2026-11-02", "34ca7e4cc0ffee", 7.7), run("2026-10-20", "9cf8364abcdef", 8)],
      authoredFlows: [{ id: "release", title: "Release", caption: "", nodes: [], edges: [] }]
    });
    const notes = [
      "### 2026-10-20 — ninth run (`9cf8364`, fan-out)",
      "",
      "- **Dim 6 → 9.** Release path tested.",
      "### 2026-11-02 — tenth run (`34ca7e4`, fan-out)",
      "- Dim 7 → 8.",
      "- Dim 6 → 8."
    ].join("\n");
    const repoRoot = await checkout(ledger(data, notes));

    const view = scorecardViewSchema.parse(
      await readScorecard({ repoRoot, remote: "git@github.com:owner/repo.git" })
    );

    if (view.state !== "ready") throw new Error(`expected a ready view, got ${view.state}`);
    expect(view.runs.map((entry) => entry.date)).toEqual(["2026-10-20", "2026-11-02"]);
    expect(view.calibration).toEqual({
      "9cf8364": ["**Dim 6 → 9.** Release path tested."],
      "34ca7e4": ["Dim 7 → 8.", "Dim 6 → 8."]
    });
    expect(view.repository).toBe("owner/repo");
    expect(view.flows.map((flow) => flow.id)).toEqual([
      "workspace-graph",
      "ci-topology",
      "release"
    ]);
    const workspace = view.flows[0];
    const x = (id: string): number | undefined =>
      workspace?.nodes.find((node) => node.id === id)?.x;
    expect(workspace?.edges).toEqual([{ from: "@repo/a", to: "@repo/b" }]);
    expect(x("@repo/b")).toBeGreaterThan(x("@repo/a") ?? Infinity);
    expect(view.flows[1]?.edges).toEqual([{ from: "ci.yml:fast", to: "ci.yml:gate" }]);
  });

  it("skips a package.json or workflow that does not parse, and still shows the ledger", async () => {
    const data = JSON.stringify({
      schema: 1,
      runs: [run("2026-11-02", "34ca7e4", 7.7)],
      authoredFlows: []
    });
    const repoRoot = await checkout(ledger(data));
    await mkdir(path.join(repoRoot, "packages/broken"), { recursive: true });
    await writeFile(path.join(repoRoot, "packages/broken/package.json"), "{ not json");
    await writeFile(path.join(repoRoot, ".github/workflows/wip.yml"), "jobs: [unclosed");

    const view = await readScorecard({ repoRoot, remote: null });

    if (view.state !== "ready") throw new Error(`expected a ready view, got ${view.state}`);
    expect(view.runs).toHaveLength(1);
    expect(view.flows[0]?.nodes.map((node) => node.id)).toEqual(["@repo/a", "@repo/b"]);
    expect(view.flows[1]?.nodes.map((node) => node.id)).toEqual(["ci.yml:fast", "ci.yml:gate"]);
  });

  it("says the ledger is missing instead of failing", async () => {
    const repoRoot = await checkout(null);
    expect(await readScorecard({ repoRoot, remote: null })).toEqual({
      state: "missing",
      ledgerPath: "docs/agents/monorepo-scorecard.md"
    });
  });

  it.each([
    ["broken JSON", "{ runs: ", "JSON is invalid"],
    [
      "a run with an unknown mode",
      JSON.stringify({
        schema: 1,
        runs: [{ ...run("2026-11-02", "34ca7e4", 7), mode: "solo" }],
        authoredFlows: []
      }),
      "at runs.0.mode"
    ]
  ])("reports %s as an invalid ledger with the reason", async (_name, data, reason) => {
    const repoRoot = await checkout(ledger(data));
    const view = await readScorecard({ repoRoot, remote: null });
    expect(view.state).toBe("invalid");
    expect(view.state === "invalid" ? view.detail : "").toContain(reason);
  });
});

describe("githubRepository", () => {
  it.each([
    ["https://github.com/owner/repo.git", "owner/repo"],
    ["git@github.com:owner/repo.git", "owner/repo"],
    ["https://github.com/owner/repo", "owner/repo"],
    ["https://gitlab.com/owner/repo.git", null]
  ])("reads %s as %s", (remote, expected) => {
    expect(githubRepository(remote)).toBe(expected);
  });
});

describe("the tracked ledger", () => {
  it("parses with the desk contract, so the skill and the desk read one format", async () => {
    const raw = await readFile(
      path.resolve(import.meta.dirname, "../../../../docs/agents/monorepo-scorecard.md"),
      "utf8"
    );
    const ledger = parseScorecardLedger(raw);
    const keys = new Set(ledger.runs.flatMap((entry) => Object.keys(entry.dimensions)));
    expect(
      [...keys].every((key) => Number(key) >= 1 && Number(key) <= SCORECARD_DIMENSIONS.length)
    ).toBe(true);
  });
});
