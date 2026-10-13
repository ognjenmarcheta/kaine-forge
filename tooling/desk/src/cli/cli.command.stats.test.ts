import { appendFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import type { RunRecord } from "../contracts";
import { appendRunRecord, runsPath } from "../stats/stats.runs";
import { createCliEnv, type CliEnv } from "../testing/cli.testing";

let env: CliEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

const record = (over: Partial<RunRecord> = {}): RunRecord => ({
  schema: 1,
  at: "2026-10-13T09:00:00.000Z",
  issue: 12,
  role: "builder",
  provider: "claude",
  model: "opus",
  isolation: "host",
  loops: { check: 0, review: 0 },
  durationMs: 120_000,
  ok: true,
  accepted: true,
  failureKind: null,
  usage: { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 200 },
  costUsd: 1.5,
  turns: 30,
  toolCalls: 40,
  editCalls: 3,
  failedToolCalls: 2,
  denials: 0,
  harness: null,
  ...over
});

describe("stats", () => {
  it("says so when no run is recorded", async () => {
    env = await createCliEnv();
    expect(await env.run("stats")).toMatchObject({
      code: 0,
      stdout: "No agent runs recorded yet.\n"
    });
  });

  it("prints one row per role, provider and model, the issues, and skipped lines", async () => {
    env = await createCliEnv();
    await appendRunRecord(env.stateRoot, record({ role: "planner", model: null, costUsd: 0.5 }));
    await appendRunRecord(env.stateRoot, record());
    await appendRunRecord(
      env.stateRoot,
      record({ failureKind: "stuck", ok: false, accepted: false })
    );
    await appendFile(runsPath(env.stateRoot), "not json\n");

    const result = await env.run("stats");

    expect(result.code).toBe(0);
    const lines = result.stdout.split("\n");
    expect(lines.find((line) => line.startsWith("planner"))?.split(/\s{2,}/)).toEqual([
      "planner",
      "claude",
      "(default)",
      "1",
      "1",
      "0",
      "0",
      "2.0m",
      "1000",
      "200",
      "30",
      "3.0",
      "$0.50",
      "$0.50"
    ]);
    expect(
      lines
        .find((line) => line.startsWith("builder"))
        ?.split(/\s{2,}/)
        .slice(0, 7)
    ).toEqual(["builder", "claude", "opus", "2", "1", "1", "0"]);
    expect(lines).toContain("#12  removed  -  3 runs  $3.50");
    expect(lines).toContain("1 line(s) of runs.jsonl could not be read and were skipped.");
  });

  it("filters by role and refuses an unknown role", async () => {
    env = await createCliEnv();
    await appendRunRecord(env.stateRoot, record({ role: "reviewer", provider: "codex" }));
    await appendRunRecord(env.stateRoot, record());

    const json = await env.run("stats", "--role", "reviewer", "--json");
    const parsed: { groups: { role: string }[] } = JSON.parse(json.stdout);
    expect(parsed.groups.map((group) => group.role)).toEqual(["reviewer"]);
    expect((await env.run("stats", "--role", "tester")).code).toBe(2);
  });
});
