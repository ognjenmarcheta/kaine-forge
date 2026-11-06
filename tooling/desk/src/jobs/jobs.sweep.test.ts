import { describe, expect, it } from "vitest";

import { coverageLines, runSweep, sweepSchema } from "./jobs.sweep";
import { fakeExec, fail, ok } from "../testing/exec.fake";

const NOW = (): Date => new Date("2026-11-02T12:00:00.000Z");

describe("runSweep", () => {
  it("runs every check and gh read itself, keeps failures as facts, and reads the coverage", async () => {
    const log = [
      "2026-11-02T11:51:21.5Z  Test Files  242 passed | 2 skipped (244)",
      "2026-11-02T11:51:21.6Z       Tests  2670 passed | 6 skipped (2676)",
      "2026-11-02T11:51:21.7Z All files          |   70.47 |    65.46 |   65.87 |   71.66 |"
    ].join("\n");
    const fake = fakeExec([
      { argv: ["pnpm", "audit"], reply: fail("1 high", 1) },
      { argv: ["pnpm"], reply: ok("clean") },
      {
        argv: ["gh", "run", "list", "--workflow", "CI PR", "--status"],
        reply: ok(JSON.stringify([{ databaseId: 41, conclusion: "success" }]))
      },
      {
        argv: ["gh", "run", "view", "41"],
        reply: ok(JSON.stringify({ jobs: [{ name: "Coverage Threshold", databaseId: 125 }] }))
      },
      { argv: ["gh", "api", "repos/{owner}/{repo}/actions/jobs/125/logs"], reply: ok(log) },
      { argv: ["gh"], reply: ok("[]") }
    ]);

    const sweep = sweepSchema.parse(await runSweep(fake.exec, "/wt", "abc", NOW));

    expect(sweep.results.find((entry) => entry.id === "audit")).toMatchObject({ code: 1 });
    expect(sweep.results.map((entry) => entry.id)).toEqual([
      "boundaries",
      "knip",
      "audit",
      "ai-doctor",
      "runs-main",
      "runs-ci-pr",
      "code-scanning",
      "dependabot",
      "rulesets",
      "issues",
      "open-prs"
    ]);
    expect(sweep.coverage).toContain("All files          |   70.47");
    expect(fake.calls.every((call) => call.cwd === "/wt")).toBe(true);
  });

  it("says why the coverage is missing instead of failing", async () => {
    const fake = fakeExec([{ argv: ["gh", "run", "list"], reply: ok("[]") }]);
    const sweep = await runSweep(fake.exec, "/wt", "abc", NOW, []);
    expect(sweep.coverage).toBe("No green CI PR run found.");
  });
});

describe("coverageLines", () => {
  it("keeps the totals and the test counts, without the log timestamps", () => {
    expect(
      coverageLines(
        "2026-11-02T11:51:21Z All files | 70 |\nnoise\n2026-11-02T11:51:21Z Tests  3 passed"
      )
    ).toBe("All files | 70 |\nTests  3 passed");
  });
});
