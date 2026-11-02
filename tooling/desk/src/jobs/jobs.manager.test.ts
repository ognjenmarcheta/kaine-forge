import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AgentRunOutcome, AgentRunRequest, AgentRunner } from "../agents/agent.runner";
import type { ScorecardJobResult, ScorecardRun } from "../contracts";
import { fakeExec, ok } from "../testing/exec.fake";
import { createFakeGit } from "../testing/git.fake";
import { fakeGitHub, type FakeGitHub } from "../testing/github.fake";
import type { CreateWorktreeResult } from "../worktree";
import { createJobManager, JobRefusal, type JobManager } from "./jobs.manager";
import { createJobStore } from "./jobs.store";

const LEDGER = "docs/agents/monorepo-scorecard.md";
const previous: ScorecardRun = {
  date: "2026-10-20",
  commit: "9cf8364f919d60c402691d317959ae5ddec85a8b",
  mode: "fan-out",
  agent: "claude",
  overall: 8,
  dimensions: { "1": { score: 8, evidence: "ok" } },
  findings: []
};
const LEDGER_TEXT = [
  "# Scorecard",
  "<!-- scorecard:data:start -->",
  "```json",
  JSON.stringify({ schema: 1, runs: [previous], authoredFlows: [] }, null, 2),
  "```",
  "<!-- scorecard:data:end -->",
  "## Calibration notes",
  ""
].join("\n");

const RESULT: ScorecardJobResult = {
  summary: "Two dimensions dropped.",
  run: { ...previous, dimensions: { "1": { score: 7, evidence: "drift" } } },
  calibration: ["Dim 1 → 7 with cause."],
  proposedIssues: ["ui-lab-gap", "adr-index-drift"].map((slug) => ({
    slug,
    title: `docs: ${slug}`,
    labels: ["type:docs"],
    body: `## Outcome\n\n${slug}`
  })),
  openQuestions: [],
  plainLanguage: "The score dropped a little."
};

interface Harness {
  readonly jobs: JobManager;
  readonly github: FakeGitHub;
  readonly requests: AgentRunRequest<unknown>[];
  readonly calls: () => string[];
  readonly worktree: string;
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "desk-jobs-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

interface HarnessOptions {
  /** `gh issue create` fails this many times first. */
  readonly failIssues?: number;
  /** Setup waits for this before it makes the worktree. */
  readonly setupGate?: Promise<void>;
}

const harness = (outcome: AgentRunOutcome<unknown>, options: HarnessOptions = {}): Harness => {
  const repoRoot = path.join(root, "repo");
  const git = createFakeGit({
    repoRoot,
    files: {
      [LEDGER]: LEDGER_TEXT,
      ".ai/permissions.json": JSON.stringify({ rules: [] }),
      ".ai/mcp.json": JSON.stringify({ mcpServers: { serena: {} } }),
      ".ai/skills/kaine-scorecard.md": "---\nname: kaine-scorecard\n---\n"
    }
  });
  const exec = fakeExec([
    { argv: ["pnpm"], reply: ok() },
    { argv: ["gh", "run", "list", "--workflow", "CI PR", "--status"], reply: ok("[]") },
    { argv: ["gh"], reply: ok("[]") },
    { argv: ["git"], reply: ok() }
  ]);
  const github = fakeGitHub();
  let issueFailures = options.failIssues ?? 0;
  const githubPort = {
    ...github,
    createIssue: (request: Parameters<FakeGitHub["createIssue"]>[0]) =>
      issueFailures-- > 0
        ? Promise.reject(new Error("gh issue create failed"))
        : github.createIssue(request)
  };
  const requests: AgentRunRequest<unknown>[] = [];
  const runner: AgentRunner = {
    run: <T>(request: AgentRunRequest<T>) => {
      requests.push(request);
      // SAFETY: the fake answers every request with the outcome the test built for the scorer.
      return Promise.resolve(outcome as AgentRunOutcome<T>);
    }
  };
  const worktree = path.join(root, "worktrees", "KAINE-job-1");
  const prepareWorktree = async (
    _deps: unknown,
    request: { readonly input: { readonly worktreeDir: string } }
  ): Promise<CreateWorktreeResult> => {
    await options.setupGate;
    await git.port.worktreeAdd(repoRoot, {
      branch: "KAINE-chore-scorecard-2026-11-02-job-1",
      dir: request.input.worktreeDir,
      base: "origin/main"
    });
    return {
      ok: true,
      worktreePath: request.input.worktreeDir,
      baseSha: "b".repeat(40),
      branch: "KAINE-chore-scorecard-2026-11-02-job-1",
      reused: false
    };
  };
  const jobs = createJobManager({
    store: createJobStore(path.join(root, "state")),
    exec: exec.exec,
    git: git.port,
    github: githubPort,
    runner,
    clock: { now: () => new Date("2026-11-02T12:00:00.000Z") },
    repoRoot,
    worktreesDir: path.join(root, "worktrees"),
    base: "main",
    sweepSteps: [{ id: "boundaries", argv: ["pnpm", "boundaries"], timeoutMs: 1000 }],
    prepareWorktree
  });
  return {
    jobs,
    github,
    requests,
    calls: () => exec.calls.map((call) => call.argv.join(" ")),
    worktree
  };
};

const success: AgentRunOutcome<unknown> = {
  ok: true,
  result: {
    structured: RESULT,
    sessionId: "s1",
    usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
    costUsd: 4.2,
    denials: [],
    trace: [],
    resultText: ""
  }
};

const startScorecard = async (h: Harness): Promise<number> => {
  const job = await h.jobs.start({ kind: "scorecard", budgetUsd: 12 });
  await h.jobs.settled(job.id);
  return job.id;
};

describe("the scorecard job", () => {
  it("sweeps, scores with subagents under a budget, writes the ledger, and waits at the gate", async () => {
    const h = harness(success);
    const id = await startScorecard(h);

    const job = await h.jobs.get(id);
    expect(job).toMatchObject({ status: "waiting", stage: "review", spentUsd: 4.2 });
    const request = h.requests[0];
    expect(request).toMatchObject({ role: "scorer", model: "opus", maxBudgetUsd: 12 });
    expect(request?.permissions.allow).toContain("Agent");
    expect(request?.permissions.disallow).toContain("Bash(gh:*)");
    expect(request?.prompt).toContain(path.join(h.worktree, ".ai.local/desk-job/sweep.json"));
    // The engine ran the sweep and the render; the ledger holds the engine's facts.
    expect(h.calls()).toEqual(
      expect.arrayContaining([
        "pnpm boundaries",
        "pnpm scorecard",
        `pnpm exec prettier --write ${LEDGER}`
      ])
    );
    const ledger = await readFile(path.join(h.worktree, LEDGER), "utf8");
    expect(ledger).toContain('"agent": "desk-job"');
    expect(ledger).toContain("### 2026-11-02 — desk job 1 (`bbbbbbb`, fan-out)");
  });

  it("files only the ticked issues, then pushes the ledger and opens a draft PR", async () => {
    const h = harness(success);
    const id = await startScorecard(h);

    await h.jobs.act(id, { action: "approve", issues: ["adr-index-drift"], confirm: true });
    await h.jobs.settled(id);

    expect(h.github.createdIssues.map((issue) => issue.title)).toEqual(["docs: adr-index-drift"]);
    expect(h.calls()).toContain("gh issue edit 501 --add-label type:docs");
    expect(h.github.createdPullRequests).toMatchObject([
      { base: "main", head: "KAINE-chore-scorecard-2026-11-02-job-1", draft: true }
    ]);
    expect(h.github.pullRequestLabels).toEqual([
      { pr: expect.any(Number), label: "release:skip-changeset" }
    ]);
    expect(h.calls()).toContain("git push -u origin KAINE-chore-scorecard-2026-11-02-job-1");
    expect(await h.jobs.get(id)).toMatchObject({
      status: "done",
      filedIssues: [{ slug: "adr-index-drift" }]
    });
  });

  it("refuses an issue the run did not propose", async () => {
    const h = harness(success);
    const id = await startScorecard(h);
    await expect(
      h.jobs.act(id, { action: "approve", issues: ["made-up"], confirm: true })
    ).rejects.toThrow(JobRefusal);
    expect(h.github.createdIssues).toEqual([]);
  });

  it("stops as needs-you with the budget reason when Claude spends the budget", async () => {
    const h = harness({
      ok: false,
      failure: {
        kind: "process-error",
        message: "claude ended with error_max_budget_usd: Reached maximum budget ($12)",
        exitCode: 1,
        stderrTail: ""
      },
      partial: { trace: [], sessionId: null, denials: [], costUsd: 12.03 }
    });
    const id = await startScorecard(h);
    // The spend counts, so Continue gets only what is left of the job's budget.
    expect(await h.jobs.get(id)).toMatchObject({
      status: "needs-you",
      stop: { reason: "budget" },
      spentUsd: 12.03
    });
  });

  it("files the approved issues when a stopped ship continues", async () => {
    const h = harness(success, { failIssues: 1 });
    const id = await startScorecard(h);

    await h.jobs.act(id, { action: "approve", issues: ["adr-index-drift"], confirm: true });
    await h.jobs.settled(id);
    expect(await h.jobs.get(id)).toMatchObject({ status: "needs-you", stage: "ship" });

    await h.jobs.act(id, { action: "continue" });
    await h.jobs.settled(id);
    expect(h.github.createdIssues.map((issue) => issue.title)).toEqual(["docs: adr-index-drift"]);
    expect(await h.jobs.get(id)).toMatchObject({ status: "done" });
  });

  it("answers a cancel at once and keeps it when the running step ends", async () => {
    let release = (): void => undefined;
    const setupGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = harness(success, { setupGate });
    const job = await h.jobs.start({ kind: "scorecard" });

    expect(await h.jobs.act(job.id, { action: "cancel" })).toMatchObject({ status: "cancelled" });
    release();
    await h.jobs.settled(job.id);

    expect(await h.jobs.get(job.id)).toMatchObject({ status: "cancelled" });
    expect(h.requests).toEqual([]);
  });

  it("runs one scorecard job at a time", async () => {
    const h = harness(success);
    await startScorecard(h);
    await expect(h.jobs.start({ kind: "scorecard" })).rejects.toThrow(JobRefusal);
  });

  it("marks a job that ran during a restart as interrupted", async () => {
    const h = harness(success);
    const id = await startScorecard(h);
    const store = createJobStore(path.join(root, "state"));
    const job = await store.read(id);
    if (job === null) throw new Error("no job");
    await store.write({ ...job, status: "running" });

    await h.jobs.recover();

    expect(await h.jobs.get(id)).toMatchObject({
      status: "needs-you",
      stop: { reason: "interrupted" }
    });
  });
});
