import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRunOutcome, AgentRunRequest, AgentRunner } from "../agents/agent.runner";
import type { ScreenJobResult } from "../contracts";
import { fakeExec, fail, ok, type FakeReply } from "../testing/exec.fake";
import { createFakeGit } from "../testing/git.fake";
import { fakeGitHub, type FakeGitHub } from "../testing/github.fake";
import type { CreateWorktreeResult } from "../worktree";
import type { LabServers } from "./jobs.devserver";
import { createJobManager, type JobManager } from "./jobs.manager";
import { createJobStore } from "./jobs.store";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);
const BRANCH = "KAINE-feat-lab-10-sample-job-1";
const RESULT: ScreenJobResult = {
  summary: "Recreated the sample screen.",
  deviations: ["COLOR-1: the gray label is darker for contrast."],
  openQuestions: [],
  plainLanguage: "The screen matches the picture closely."
};

interface Harness {
  readonly jobs: JobManager;
  readonly github: FakeGitHub;
  readonly requests: AgentRunRequest<unknown>[];
  readonly calls: () => string[];
  readonly stopped: number[];
  readonly worktree: string;
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "desk-screen-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const success: AgentRunOutcome<unknown> = {
  ok: true,
  result: {
    structured: RESULT,
    sessionId: "s1",
    usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
    costUsd: 2.5,
    denials: [],
    trace: [],
    resultText: ""
  }
};

const harness = (checkReply: FakeReply = ok(), waitForCancel = false): Harness => {
  const repoRoot = path.join(root, "repo");
  const git = createFakeGit({
    repoRoot,
    files: {
      ".ai/permissions.json": JSON.stringify({ rules: [] }),
      ".ai/mcp.json": JSON.stringify({ mcpServers: { serena: {}, playwright: {} } }),
      ".ai/skills/kaine-build-ui.md": "---\nname: kaine-build-ui\n---\n"
    }
  });
  const exec = fakeExec([
    {
      argv: ["pnpm", "lab:diff"],
      reply: ok('> lab-diff\n[{ "id": "10-sample", "differing": 3.4, "crop": false }]')
    },
    { argv: ["pnpm", "--filter", "@repo/desk-ui", "exec", "vitest"], reply: checkReply },
    { argv: ["pnpm"], reply: ok() },
    { argv: ["git"], reply: ok() }
  ]);
  const github = fakeGitHub();
  const requests: AgentRunRequest<unknown>[] = [];
  const runner: AgentRunner = {
    run: <T>(request: AgentRunRequest<T>) => {
      requests.push(request);
      if (waitForCancel) {
        // Like the Claude runner: the run ends only when the job is cancelled.
        return new Promise((resolve) =>
          request.signal?.addEventListener("abort", () =>
            resolve({
              ok: false,
              failure: { kind: "aborted" },
              partial: { trace: [], sessionId: null, denials: [] }
            })
          )
        );
      }
      // SAFETY: the fake answers every request with the screen result the test built.
      return Promise.resolve(success as AgentRunOutcome<T>);
    }
  };
  const stopped: number[] = [];
  const labServers: LabServers = {
    ensure: (jobId) =>
      Promise.resolve({
        port: 5555,
        labUrl: "http://localhost:5555/lab-frame.html",
        stop: () => Promise.resolve()
      }).then((server) => {
        void jobId;
        return server;
      }),
    get: () => null,
    stop: (jobId) => {
      stopped.push(jobId);
      return Promise.resolve();
    },
    stopAll: () => Promise.resolve()
  };
  const worktree = path.join(root, "worktrees", "KAINE-job-1");
  const prepareWorktree = async (
    _deps: unknown,
    request: { readonly input: { readonly worktreeDir: string } }
  ): Promise<CreateWorktreeResult> => {
    await git.port.worktreeAdd(repoRoot, {
      branch: BRANCH,
      dir: request.input.worktreeDir,
      base: "origin/main"
    });
    return {
      ok: true,
      worktreePath: request.input.worktreeDir,
      baseSha: "b".repeat(40),
      branch: BRANCH,
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
    worktree
  };
};

const startScreen = async (h: Harness): Promise<number> => {
  const job = await h.jobs.start({
    kind: "screen",
    screen: {
      id: "10-sample",
      title: "Sample",
      mode: "light",
      width: 1280,
      height: 800,
      reference: { mediaType: "image/png", dataBase64: PNG.toString("base64") }
    }
  });
  await h.jobs.settled(job.id);
  return job.id;
};

describe("the screen job", () => {
  it("builds in its lab server with write access to its own folder only, then measures the diff", async () => {
    const h = harness();
    const id = await startScreen(h);

    expect(await h.jobs.get(id)).toMatchObject({
      status: "waiting",
      stage: "review",
      spentUsd: 2.5,
      screen: { diffPercent: 3.4, port: 5555 }
    });
    const request = h.requests[0];
    expect(request?.env).toEqual({ LAB_URL: "http://localhost:5555/lab-frame.html" });
    expect(request?.permissions.allow).toContain(
      "Edit(tooling/desk-ui/src/lab/screens/10-sample/**)"
    );
    expect(request?.prompt).toContain("tooling/desk-ui/public/references/10-sample.png");
    const reference = await readFile(
      path.join(h.worktree, "tooling/desk-ui/public/references/10-sample.png")
    );
    expect(reference.equals(PNG)).toBe(true);
    expect(h.calls()).toContain("pnpm lab:diff 10-sample --json");
  });

  it("ships only the screen folder as a draft PR and stops the lab server", async () => {
    const h = harness();
    const id = await startScreen(h);

    await h.jobs.act(id, { action: "approve", issues: [], confirm: true });
    await h.jobs.settled(id);

    expect(h.calls()).toContain(`git push -u origin ${BRANCH}`);
    expect(h.github.createdPullRequests).toMatchObject([{ head: BRANCH, draft: true }]);
    expect(h.github.createdIssues).toEqual([]);
    expect(h.stopped).toEqual([id]);
    expect(await h.jobs.get(id)).toMatchObject({ status: "done", screen: { port: null } });
  });

  it("stops on a failing check, hands the output to the builder, and builds again on continue", async () => {
    const h = harness(fail("lab.registry.test.ts: contrast pair fails"));
    const id = await startScreen(h);

    const stopped = await h.jobs.get(id);
    expect(stopped).toMatchObject({ status: "needs-you", stop: { reason: "failed" } });
    expect(stopped?.feedback.at(-1)).toContain("contrast pair fails");

    await h.jobs.act(id, { action: "continue" });
    await h.jobs.settled(id);
    expect(h.requests).toHaveLength(2);
    expect(h.requests[1]?.prompt).toContain("contrast pair fails");
  });

  it("stays cancelled and stops its lab server when cancelled during the build", async () => {
    const h = harness(ok(), true);
    const job = await h.jobs.start({
      kind: "screen",
      screen: {
        id: "10-sample",
        title: "Sample",
        mode: "light",
        width: 1280,
        height: 800,
        reference: { mediaType: "image/png", dataBase64: PNG.toString("base64") }
      }
    });
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));

    await h.jobs.act(job.id, { action: "cancel" });
    await h.jobs.settled(job.id);

    expect(await h.jobs.get(job.id)).toMatchObject({ status: "cancelled" });
    expect(h.stopped).toContain(job.id);
    expect(h.calls()).not.toContain("pnpm lab:diff 10-sample --json");
  });

  it("refuses a reference that is not the image it claims to be", async () => {
    const h = harness();
    await expect(
      h.jobs.start({
        kind: "screen",
        screen: {
          id: "10-sample",
          title: "Sample",
          mode: "light",
          width: 1280,
          height: 800,
          reference: {
            mediaType: "image/png",
            dataBase64: Buffer.from("not an image").toString("base64")
          }
        }
      })
    ).rejects.toThrow(/not a image\/png image/);
  });
});
