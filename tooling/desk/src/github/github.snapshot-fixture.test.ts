import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CONTRACT_SECTIONS, parseContract } from "./github.contract";
import { readSnapshotFile } from "./github.snapshot-file";
import { createCliEnv, type CliEnv } from "../testing/cli.testing";
import { builderOutput, planOutput, reviewOutput, writeFeature } from "../testing/pipeline.testing";

vi.setConfig({ testTimeout: 30_000 });

/** The snapshot that "Try it without GitHub" in the manual starts. */
const FIXTURE = path.resolve(import.meta.dirname, "../../fixtures/docs-issue.snapshot.json");
const DOC = "docs/agents/day-one.md";

let env: CliEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

describe("docs-issue.snapshot.json", () => {
  it("parses with the snapshot schema and describes issue 9001", async () => {
    const snapshot = await readSnapshotFile(FIXTURE);
    expect(snapshot).toMatchObject({ number: 9001, open: true, comments: [], labelEvents: [] });
  });

  it("passes the lenient contract with all six headings and checkable criteria", async () => {
    const { body } = await readSnapshotFile(FIXTURE);
    const report = parseContract(body);
    expect(report.found).toBe(CONTRACT_SECTIONS.length);
    expect(report.missing).toEqual([]);
    expect(report.acceptanceCriteria.length).toBeGreaterThanOrEqual(3);
    for (const criterion of report.acceptanceCriteria) expect(criterion).not.toBe("");
  });

  it("targets a file that exists in the repository and does not have the section yet", async () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../../..");
    await expect(stat(path.join(repoRoot, DOC))).resolves.toBeTruthy();
    expect(await readFile(path.join(repoRoot, DOC), "utf8")).not.toContain("## Quick start");
    expect((await readSnapshotFile(FIXTURE)).body).toContain(DOC);
  });

  it("starts through the CLI with the manual's flags and reports contract 6/6", async () => {
    env = await createCliEnv({
      steps: [
        { role: "planner", output: planOutput() },
        { role: "builder", output: builderOutput(), effect: (run) => writeFeature(run) },
        { role: "reviewer", output: reviewOutput() }
      ]
    });
    const started = await env.run(
      "start",
      "9001",
      "--override",
      "--no-writeback",
      "--snapshot-file",
      FIXTURE
    );
    expect(started.code).toBe(0);
    expect(started.stdout).toContain("#9001: waiting for you (stage plan-gate");
    const ticket = await readFile(path.join(env.issueDir(9001), "artifacts", "ticket.md"), "utf8");
    expect(ticket).toContain("Readiness: contract 6/6");

    expect((await env.run("approve", "9001")).stdout).toContain("stage pr-review");
    expect(env.github.labelEdits).toEqual([]);
    const removed = await env.run("remove", "9001", "--force");
    expect(removed.code).toBe(0);
    await expect(stat(env.issueDir(9001))).rejects.toThrow();
  });
});
