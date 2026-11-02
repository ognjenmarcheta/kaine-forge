import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AgentRunOutcome, AgentRunRequest, AgentRunner } from "../agents/agent.runner";
import type { AuditJobResult, ComponentJobResult, ComponentPlan } from "../contracts";
import { fakeExec, ok } from "../testing/exec.fake";
import { createFakeGit } from "../testing/git.fake";
import { fakeGitHub, type FakeGitHub } from "../testing/github.fake";
import type { CreateWorktreeResult } from "../worktree";
import type { LabServers } from "./jobs.devserver";
import { createJobManager, JobRefusal, type JobManager } from "./jobs.manager";
import { componentFiles } from "./jobs.permissions";
import { createJobStore } from "./jobs.store";

const PLAN: ComponentPlan = {
  summary: "A row of stars for a 0–5 rating.",
  api: ["value: number", "max?: number (5)", "label: string"],
  reuse: ["lucide Star", "--ds-icon-warning"],
  tests: ["names the rating for a screen reader"],
  openQuestions: [],
  plainLanguage: "Stars that show a score."
};
const BUILT: ComponentJobResult = {
  summary: "Added RatingStars.",
  deviations: [],
  openQuestions: [],
  plainLanguage: "The stars are in the kit."
};
const AUDITED: AuditJobResult = {
  summary: "Two problems.",
  matchPercent: 91,
  findings: ["low-contrast-label", "missing-focus-ring"].map((slug) => ({
    slug,
    title: `fix(lab): ${slug}`,
    labels: ["type:bug"],
    body: "## Outcome",
    ruleId: "COLOR-1",
    severity: "must" as const
  })),
  openQuestions: [],
  plainLanguage: "Two things to fix."
};
const COMPONENT = { name: "RatingStars", layer: "composed" } as const;

interface Harness {
  readonly jobs: JobManager;
  readonly github: FakeGitHub;
  readonly requests: AgentRunRequest<unknown>[];
  readonly calls: () => string[];
  readonly stopped: number[];
  readonly repoRoot: string;
  readonly worktree: string;
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "desk-lab-jobs-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const answer = (structured: unknown): AgentRunOutcome<unknown> => ({
  ok: true,
  result: {
    structured,
    sessionId: "s1",
    usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
    costUsd: 1,
    denials: [],
    trace: [],
    resultText: ""
  }
});

const harness = async (): Promise<Harness> => {
  const repoRoot = path.join(root, "repo");
  const worktree = path.join(root, "worktrees", "KAINE-job-1");
  // The main checkout on disk: a lab screen to audit, and its local reference image.
  await mkdir(path.join(repoRoot, "tooling/desk-ui/src/lab/screens/10-sample"), {
    recursive: true
  });
  await mkdir(path.join(repoRoot, "tooling/desk-ui/public/references"), { recursive: true });
  await writeFile(path.join(repoRoot, "tooling/desk-ui/public/references/10-sample.png"), "png");
  const git = createFakeGit({
    repoRoot,
    files: {
      ".ai/permissions.json": JSON.stringify({ rules: [] }),
      ".ai/mcp.json": JSON.stringify({ mcpServers: { serena: {}, playwright: {} } })
    }
  });
  const exec = fakeExec([
    { argv: ["pnpm"], reply: ok() },
    { argv: ["gh"], reply: ok() },
    { argv: ["git"], reply: ok() }
  ]);
  const github = fakeGitHub();
  const requests: AgentRunRequest<unknown>[] = [];
  const runner: AgentRunner = {
    run: async <T>(request: AgentRunRequest<T>) => {
      requests.push(request);
      let structured: unknown = AUDITED;
      if (request.prompt.includes("component job, plan step")) structured = PLAN;
      if (request.prompt.includes("component job, build step")) {
        // The builder writes the files it may write.
        for (const file of componentFiles(COMPONENT)) {
          await mkdir(path.dirname(path.join(worktree, file)), { recursive: true });
          await writeFile(path.join(worktree, file), "export {};\n");
        }
        structured = BUILT;
      }
      // SAFETY: the fake answers each step with the result the test built for that step.
      return answer(structured) as AgentRunOutcome<T>;
    }
  };
  const stopped: number[] = [];
  const labServers: LabServers = {
    ensure: () =>
      Promise.resolve({
        port: 5555,
        labUrl: "http://localhost:5555/lab-frame.html",
        stop: () => Promise.resolve()
      }),
    get: () => null,
    stop: (jobId) => {
      stopped.push(jobId);
      return Promise.resolve();
    },
    stopAll: () => Promise.resolve()
  };
  const prepareWorktree = async (
    _deps: unknown,
    request: { readonly input: { readonly worktreeDir: string; readonly slug: string } }
  ): Promise<CreateWorktreeResult> => {
    const branch = `KAINE-${request.input.slug}`;
    await git.port.worktreeAdd(repoRoot, {
      branch,
      dir: request.input.worktreeDir,
      base: "origin/main"
    });
    return {
      ok: true,
      worktreePath: request.input.worktreeDir,
      baseSha: "b".repeat(40),
      branch,
      reused: false
    };
  };
  const jobs = createJobManager({
    store: createJobStore(path.join(root, "state")),
    exec: exec.exec,
    git: git.port,
    github,
    runner,
    clock: { now: () => new Date("2026-11-02T12:00:00.000Z") },
    repoRoot,
    worktreesDir: path.join(root, "worktrees"),
    base: "main",
    prepareWorktree,
    labServers
  });
  return {
    jobs,
    github,
    requests,
    calls: () => exec.calls.map((call) => call.argv.join(" ")),
    stopped,
    repoRoot,
    worktree
  };
};

const writeRules = (request: AgentRunRequest<unknown> | undefined): string[] =>
  (request?.permissions.allow ?? []).filter(
    (rule) => rule.startsWith("Edit") || rule.startsWith("Write")
  );

describe("the component job", () => {
  it("plans without write access and waits for the plan's approval", async () => {
    const h = await harness();
    const job = await h.jobs.start({ kind: "component", component: COMPONENT });
    await h.jobs.settled(job.id);

    expect(await h.jobs.get(job.id)).toMatchObject({
      status: "waiting",
      stage: "plan",
      component: { plan: PLAN, planApproved: false }
    });
    expect(h.requests).toHaveLength(1);
    expect(writeRules(h.requests[0])).toEqual([]);
  });

  it("builds only its files after the plan's approval, then ships them with a changeset", async () => {
    const h = await harness();
    const job = await h.jobs.start({ kind: "component", component: COMPONENT });
    await h.jobs.settled(job.id);

    await h.jobs.act(job.id, { action: "approve", issues: [], confirm: true });
    await h.jobs.settled(job.id);
    expect(writeRules(h.requests[1])).toEqual([
      "Edit(packages/ui/src/components/composed/rating-stars.tsx)",
      "Edit(packages/ui/src/components/composed/rating-stars.test.tsx)",
      "Edit(packages/ui/src/index.ts)",
      "Edit(tooling/desk-ui/src/lab/specimens/rating-stars.specimen.tsx)",
      "Edit(DESIGN_SYSTEM.md)"
    ]);
    expect(h.requests[1]?.env).toEqual({ LAB_URL: "http://localhost:5555/lab-frame.html" });
    expect(h.calls()).toContain(
      "pnpm --filter @repo/ui exec vitest run src/components/composed/rating-stars.test.tsx"
    );
    expect(await h.jobs.get(job.id)).toMatchObject({ status: "waiting", stage: "review" });

    await h.jobs.act(job.id, { action: "approve", issues: [], confirm: true });
    await h.jobs.settled(job.id);
    const changeset = await readFile(
      path.join(h.worktree, ".changeset/ui-rating-stars.md"),
      "utf8"
    );
    expect(changeset).toContain('"@repo/ui": minor');
    expect(h.github.createdPullRequests).toMatchObject([
      { head: "KAINE-ui-rating-stars-job-1", draft: true }
    ]);
    // A package change carries its changeset, so the PR gets no skip label.
    expect(h.github.pullRequestLabels).toEqual([]);
    expect(h.stopped).toEqual([job.id]);
    expect(await h.jobs.get(job.id)).toMatchObject({ status: "done", component: { port: null } });
  });

  it("refuses a name that @repo/ui already exports, from any folder", async () => {
    const h = await harness();
    await mkdir(path.join(h.repoRoot, "packages/ui/src/components/layouts"), { recursive: true });
    await writeFile(
      path.join(h.repoRoot, "packages/ui/src/components/layouts/stars.tsx"),
      "export function RatingStars() {}\n"
    );
    await expect(h.jobs.start({ kind: "component", component: COMPONENT })).rejects.toThrow(
      JobRefusal
    );
  });
});

describe("the audit job", () => {
  it("audits in reference mode without write access, then files only the ticked findings", async () => {
    const h = await harness();
    const job = await h.jobs.start({ kind: "audit", audit: { screenId: "10-sample" } });
    await h.jobs.settled(job.id);

    const request = h.requests[0];
    expect(writeRules(request)).toEqual([]);
    expect(request?.env).toEqual({ LAB_URL: "http://localhost:5555/lab-frame.html" });
    expect(request?.prompt).toContain("tooling/desk-ui/public/references/10-sample.png");
    expect(await h.jobs.get(job.id)).toMatchObject({ status: "waiting", stage: "review" });

    await h.jobs.act(job.id, { action: "approve", issues: ["missing-focus-ring"], confirm: true });
    await h.jobs.settled(job.id);

    expect(h.github.createdIssues.map((issue) => issue.title)).toEqual([
      "fix(lab): missing-focus-ring"
    ]);
    expect(h.github.createdPullRequests).toEqual([]);
    expect(h.calls().some((call) => call.startsWith("git push"))).toBe(false);
    // This checkout has no .github/repo-setup.json, so no label is known and none is sent.
    expect(h.calls().some((call) => call.startsWith("gh issue edit"))).toBe(false);
    expect(h.stopped).toEqual([job.id]);
    expect(await h.jobs.get(job.id)).toMatchObject({ status: "done" });
  });

  it("refuses a screen the lab does not have", async () => {
    const h = await harness();
    await expect(h.jobs.start({ kind: "audit", audit: { screenId: "99-none" } })).rejects.toThrow(
      JobRefusal
    );
  });
});
