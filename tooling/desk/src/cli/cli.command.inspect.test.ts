import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LiveOutput } from "./cli.types";
import { createCliEnv, type CliEnv, type CliEnvOptions } from "../testing/cli.testing";
import {
  ISSUE,
  builderOutput,
  planOutput,
  reviewOutput,
  writeFeature,
  type ScriptedStep
} from "../testing/pipeline.testing";

vi.setConfig({ testTimeout: 30_000 });

let env: CliEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});
const open = async (options: CliEnvOptions = {}): Promise<CliEnv> => {
  env = await createCliEnv(options);
  return env;
};

const planStep = (over: Partial<ScriptedStep> = {}): ScriptedStep => ({
  role: "planner",
  output: planOutput(),
  sessionId: "11111111-1111-4111-8111-111111111111",
  ...over
});
const buildStep = (over: Partial<ScriptedStep> = {}): ScriptedStep => ({
  role: "builder",
  output: builderOutput(),
  sessionId: "22222222-2222-4222-8222-222222222222",
  effect: (run) => writeFeature(run),
  ...over
});
const reviewStep = (): ScriptedStep => ({ role: "reviewer", output: reviewOutput() });

describe("status", () => {
  it("lists all issues, one line each", async () => {
    const e = await open({ steps: [planStep(), planStep()] });
    expect((await e.run("status")).stdout).toBe("No desk issues yet.\n");
    await e.run("start", "7", "--no-writeback");
    const result = await e.run("status");
    expect(result.code).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual(["#7: plan-gate (waiting)"]);
  });

  it("puts the first line of the needs-you reason in the list", async () => {
    const e = await open({ steps: [] });
    await e.run("start", "7");
    const line = (await e.run("status")).stdout.trim();
    expect(line.startsWith("#7: needs-you (waiting) - ")).toBe(true);
  });

  it("shows one issue with its branch, worktree, authorization, history, and next step", async () => {
    const e = await open({ steps: [planStep()] });
    await e.run("start", "7");
    const result = await e.run("status", "7");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("#7: plan-gate (waiting)");
    expect(result.stdout).toContain("branch: KAINE-7-feat-export-reports");
    expect(result.stdout).toContain(`worktree: ${e.worktree()}`);
    expect(result.stdout).toContain("authorized by: octo-owner");
    expect(result.stdout).toContain("next: approve with: pnpm desk approve 7");
    expect(result.stdout).toContain("intake-complete - contract 6/6; ready for setup");
  });

  it("shows the needs-you reason and the continue command", async () => {
    const e = await open({ steps: [] });
    await e.run("start", "7");
    const result = await e.run("status", "7");
    expect(result.stdout).toContain("needs you:");
    expect(result.stdout).toContain("next: continue with: pnpm desk continue 7 (retries 'plan')");
  });

  it("prints JSON for one issue and for all", async () => {
    const e = await open({ steps: [planStep()] });
    await e.run("start", "7");
    const one = JSON.parse((await e.run("status", "7", "--json")).stdout);
    expect(one.issues).toHaveLength(1);
    expect(one.issues[0]).toMatchObject({
      issue: 7,
      status: "ok",
      needsYouReason: null,
      state: { stage: "plan-gate", status: "waiting", issueNumber: 7 },
      next: expect.arrayContaining(["approve with: pnpm desk approve 7"])
    });
    const all = JSON.parse((await e.run("status", "--json")).stdout);
    expect(all.issues.map((entry: { issue: number }) => entry.issue)).toEqual([7]);
    expect(JSON.parse((await e.run("status", "--json")).stdout)).toEqual(all);
  });

  it("exits 1 for an unknown or unreadable issue that was asked for by number", async () => {
    const e = await open();
    const missing = await e.run("status", "5");
    expect(missing).toMatchObject({ code: 1, stdout: "#5: no desk state\n" });
    expect(JSON.parse((await e.run("status", "5", "--json")).stdout)).toEqual({
      issues: [{ issue: 5, status: "missing" }]
    });

    const dir = path.join(e.stateRoot, "issues", "5");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "state.json"), "{ nope");
    const broken = await e.run("status", "5");
    expect(broken.code).toBe(1);
    expect(broken.stdout).toContain("unreadable (invalid-json)");
    // The list still works and shows the damage.
    expect((await e.run("status")).stdout).toContain("#5: unreadable (invalid-json)");
  });

  it.each([[["status", "x"]], [["status", "1", "2"]], [["status", "--bogus"]]])(
    "exits 2 for bad arguments %j",
    async (argv) => {
      const e = await open();
      expect((await e.run(...argv)).code).toBe(2);
    }
  );
});

describe("logs", () => {
  it("exits 1 for an unknown issue and 2 without a number", async () => {
    const e = await open();
    const result = await e.run("logs", "5");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("#5 has no desk state");
    expect((await e.run("logs")).code).toBe(2);
  });

  it("says when the log is empty", async () => {
    const e = await open({ steps: [planStep()] });
    await e.run("start", "7");
    await rm(path.join(e.issueDir(), "agent.log.jsonl"));
    const result = await e.run("logs", "7");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("#7: no log yet");
  });

  it("prints the persisted log as readable lines", async () => {
    const e = await open({ steps: [planStep()] });
    await e.run("start", "7");
    const result = await e.run("logs", "7");
    expect(result.code).toBe(0);
    const lines = result.stdout.trim().split("\n");
    expect(lines).toContain("09:00:00 plan: stage-started");
    expect(lines.some((line) => line.includes("[planner] Skill kaine-write-plan"))).toBe(true);
    expect(lines.some((line) => line.includes("setup: stage-started"))).toBe(true);
  });

  it("prints the raw records with --json, one JSON document per line", async () => {
    const e = await open({ steps: [planStep()] });
    await e.run("start", "7");
    const result = await e.run("logs", "7", "--json");
    const raw = await readFile(path.join(e.issueDir(), "agent.log.jsonl"), "utf8");
    expect(result.stdout).toBe(raw);
    for (const line of result.stdout.trim().split("\n")) {
      expect(JSON.parse(line)).toMatchObject({ v: 1, issue: 7 });
    }
  });

  it("skips a damaged line and goes on", async () => {
    const e = await open({ steps: [planStep()] });
    await e.run("start", "7");
    await appendFile(path.join(e.issueDir(), "agent.log.jsonl"), "{ not json\n");
    const result = await e.run("logs", "7");
    expect(result.stdout).toContain("(unreadable log line skipped)");
    expect(result.stdout).toContain("plan: stage-started");
  });

  it("follows the file until the signal aborts, and shows lines that arrive later", async () => {
    const controller = new AbortController();
    const chunks: string[] = [];
    const live: LiveOutput = { out: (text) => chunks.push(text), err: (text) => chunks.push(text) };
    const e = await open({ steps: [planStep()], deps: { signal: controller.signal, live } });
    await e.run("start", "7");
    chunks.length = 0;

    const following = e.run("logs", "7", "--follow");
    await vi.waitFor(() => expect(chunks.join("")).toContain("plan: stage-started"));
    await appendFile(
      path.join(e.issueDir(), "agent.log.jsonl"),
      `${JSON.stringify({ v: 1, kind: "log", at: "2026-10-07T10:11:12Z", issue: 7, message: "later line" })}\n`
    );
    await vi.waitFor(() => expect(chunks.join("")).toContain("10:11:12 later line"));
    controller.abort();
    expect(await following).toMatchObject({ code: 0 });
  });
});

describe("resume", () => {
  it("prints the cd and resume command for each session, builder first", async () => {
    const e = await open({ steps: [planStep(), buildStep(), reviewStep()] });
    await e.run("start", "7");
    await e.run("approve", "7");
    const result = await e.run("resume", "7");

    expect(result.code).toBe(0);
    const lines = result.stdout.split("\n");
    expect(lines[0]).toBe("#7: resume an agent session by hand.");
    expect(lines[1]).toBe(
      `  builder (claude): cd ${e.worktree()} && claude --resume 22222222-2222-4222-8222-222222222222`
    );
    expect(lines[2]).toBe(
      `  planner (claude): cd ${e.worktree()} && claude --resume 11111111-1111-4111-8111-111111111111`
    );
  });

  it("prints the codex hint for a codex role and quotes a path with spaces", async () => {
    const e = await open({ steps: [planStep()] });
    await e.writeConfig({ providers: { planner: "codex" } });
    await e.run("start", "7");
    const file = path.join(e.issueDir(), "state.json");
    const state = JSON.parse(await readFile(file, "utf8"));
    const spaced = path.join(e.root, "my worktree");
    await mkdir(spaced);
    await writeFile(file, JSON.stringify({ ...state, worktreePath: spaced }));
    const result = await e.run("resume", "7");
    expect(result.stdout).toContain(
      `planner (codex): cd '${spaced}' && codex resume 11111111-1111-4111-8111-111111111111`
    );
  });

  it("refuses an unknown issue", async () => {
    const e = await open();
    const result = await e.run("resume", "5");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("#5 has no desk state");
  });

  it("refuses when there is no session yet", async () => {
    const e = await open({ steps: [planStep({ sessionId: "" })] });
    await e.run("start", "7");
    const result = await e.run("resume", "7");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("#7 has no agent session yet");
  });

  it("refuses when the worktree is not set up or is gone", async () => {
    const e = await open({ steps: [planStep()] });
    await e.run("start", "7");
    await rm(e.worktree(), { recursive: true });
    const gone = await e.run("resume", "7");
    expect(gone.code).toBe(1);
    expect(gone.stderr).toContain(`The worktree of #7 is gone: ${e.worktree()}`);

    const file = path.join(e.issueDir(), "state.json");
    const state = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, JSON.stringify({ ...state, worktreePath: null }));
    const none = await e.run("resume", "7");
    expect(none.code).toBe(1);
    expect(none.stderr).toContain("#7 has no worktree yet");
  });

  it("exits 2 without a number", async () => {
    const e = await open();
    expect((await e.run("resume")).code).toBe(2);
    expect(ISSUE).toBe(7);
  });
});
