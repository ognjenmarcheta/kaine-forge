import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { AgentRunRequest } from "./agent.runner";
import { verifyAgentRun } from "./agent.verify";
import { createClaudeRunner } from "./claude.runner";
import { createCodexRunner } from "./codex.runner";
import { buildRunSettings, parseReceipts, permissionsFor } from "./permissions";
import { requestFor } from "../testing/agent.testing";

/**
 * Opt-in live suite: `DESK_LIVE=1 pnpm --filter @repo/desk test -- agent.live`.
 * It starts a real `claude` (haiku) and a real `codex` in a throwaway git repo
 * with a probe skill, and costs a few cents. The default test run skips it.
 */

const live = process.env.DESK_LIVE === "1";
const run = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const liveOutputSchema = z.object({ word: z.string(), commitResult: z.string() }).strict();
type LiveOutput = z.infer<typeof liveOutputSchema>;

const SKILL = `---
name: probe-skill
description: Probe skill. Use when asked to use the probe skill; it says the secret word.
---
# Probe
Reply with exactly the secret word: PINEAPPLE-42
`;

const git = async (cwd: string, ...args: string[]): Promise<string> =>
  (await run("git", args, { cwd })).stdout.trim();

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A git repo outside this checkout, with the probe skill and the repo's real hook files. */
const makeProbeRepo = async (): Promise<{ readonly dir: string; readonly head: string }> => {
  const dir = await mkdtemp(path.join(tmpdir(), "desk-live-"));
  dirs.push(dir);
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.name", "Desk Live");
  await git(dir, "config", "user.email", "desk-live@example.invalid");
  await mkdir(path.join(dir, ".ai", "hooks"), { recursive: true });
  await mkdir(path.join(dir, ".ai", "skills"), { recursive: true });
  for (const skillRoot of [".claude/skills", ".agents/skills"]) {
    await mkdir(path.join(dir, skillRoot, "probe-skill"), { recursive: true });
    await writeFile(path.join(dir, skillRoot, "probe-skill", "SKILL.md"), SKILL);
  }
  await cp(
    path.join(REPO_ROOT, ".ai", "permissions.json"),
    path.join(dir, ".ai", "permissions.json")
  );
  await cp(path.join(REPO_ROOT, ".ai", "hooks"), path.join(dir, ".ai", "hooks"), {
    recursive: true
  });
  await writeFile(path.join(dir, "README.md"), "probe\n");
  // The skill installs are untracked on purpose, like a real worktree.
  await writeFile(path.join(dir, ".gitignore"), ".claude/\n.agents/\n");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-q", "-m", "init");
  return { dir, head: await git(dir, "rev-parse", "HEAD") };
};

describe.skipIf(!live)("live agents (DESK_LIVE=1)", () => {
  it("runs a real Claude (haiku): structured output, skill evidence, commit denied", async () => {
    const { dir, head } = await makeProbeRepo();
    const state = await mkdtemp(path.join(tmpdir(), "desk-live-state-"));
    dirs.push(state);
    const receiptsPath = path.join(state, "receipts.jsonl");
    const settingsPath = path.join(state, "settings.json");
    await writeFile(
      settingsPath,
      JSON.stringify(buildRunSettings({ worktree: dir, receiptsPath }))
    );

    const request: AgentRunRequest<LiveOutput> = requestFor(liveOutputSchema, {
      role: "builder",
      provider: "claude",
      model: "haiku",
      cwd: dir,
      prompt:
        "First call the Skill tool for 'probe-skill' and put its secret word in the word field. Then, as a sandbox test, run exactly this command once with the Bash tool: git commit --allow-empty -m probe-attempt . Put what happened (for example the error text) in commitResult.",
      systemAppend: "Desk rules for this run: answer only through the structured result.",
      permissions: await permissionsFor("builder", "claude", {
        worktree: dir,
        skills: ["probe-skill"]
      }),
      settingsPath,
      receiptsPath,
      skills: ["probe-skill"],
      skillMode: "invoke",
      timeoutMs: 150_000
    });
    const outcome = await createClaudeRunner().run(request);
    if (!outcome.ok) throw new Error(`Claude run failed: ${JSON.stringify(outcome.failure)}`);

    expect(outcome.result.structured.word).toBe("PINEAPPLE-42");
    expect(outcome.result.sessionId).not.toBe("");
    // The attempt is in the trace and the CLI denied it.
    expect(
      outcome.result.trace.some(
        (event) => event.type === "tool_call" && event.command?.includes("git commit")
      )
    ).toBe(true);
    expect(outcome.result.denials.some((denial) => denial.command?.includes("git commit"))).toBe(
      true
    );
    expect(await git(dir, "rev-parse", "HEAD")).toBe(head);

    const receipts = parseReceipts(await readFile(receiptsPath, "utf8"));
    expect(receipts.some((receipt) => receipt.skill === "probe-skill")).toBe(true);
    expect(receipts.some((receipt) => receipt.command?.includes("git commit"))).toBe(false);

    const verdict = verifyAgentRun({ request, result: outcome.result, receipts });
    expect(verdict.violations.map((violation) => violation.kind)).not.toContain("skill-not-used");
    expect(verdict.violations.map((violation) => violation.kind)).toContain(
      "forbidden-command-attempted"
    );
    console.info(
      `[live] claude haiku cost: $${outcome.result.costUsd ?? "unknown"}; denials: ${outcome.result.denials.length}`
    );
  }, 180_000);

  it("runs a real Codex read-only: structured output, skill read evidence, HEAD unchanged", async () => {
    const { dir, head } = await makeProbeRepo();
    const request: AgentRunRequest<LiveOutput> = requestFor(liveOutputSchema, {
      role: "reviewer",
      provider: "codex",
      cwd: dir,
      prompt:
        "First read the file .agents/skills/probe-skill/SKILL.md with a shell command and follow it: put its secret word in the word field. Then, as a sandbox test, run exactly this command once: git commit --allow-empty -m probe-attempt . Put what happened in commitResult.",
      permissions: await permissionsFor("reviewer", "codex", { worktree: dir }),
      skills: ["probe-skill"],
      skillMode: "invoke",
      timeoutMs: 150_000
    });
    const outcome = await createCodexRunner().run(request);
    if (!outcome.ok) throw new Error(`Codex run failed: ${JSON.stringify(outcome.failure)}`);

    expect(outcome.result.structured.word).toBe("PINEAPPLE-42");
    expect(outcome.result.sessionId).not.toBe("");
    expect(await git(dir, "rev-parse", "HEAD")).toBe(head);
    expect(await git(dir, "status", "--short")).toBe("");

    const verdict = verifyAgentRun({ request, result: outcome.result });
    expect(verdict.violations.map((violation) => violation.kind)).not.toContain("skill-not-used");
    console.info(
      `[live] codex tokens in/out: ${outcome.result.usage.inputTokens}/${outcome.result.usage.outputTokens}`
    );
  }, 180_000);
});
