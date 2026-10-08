import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IssueState } from "../contracts";
import { createPipelineRunner, type PipelineRunner } from "./pipeline.runner";
import type { PipelineDeps } from "./pipeline.types";
import { snapshotOf } from "../testing/github.fake";
import {
  ISSUE,
  builderOutput,
  createPipelineEnv,
  planOutput,
  reviewOutput,
  writeFeature,
  type EnvOptions,
  type PipelineEnv,
  type ScriptedStep
} from "../testing/pipeline.testing";

vi.setConfig({ testTimeout: 30_000 });

let env: PipelineEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

const open = async (options: EnvOptions = {}): Promise<PipelineEnv> => {
  env = await createPipelineEnv(options);
  return env;
};

/** Poll until `check` stops throwing. Process starts can be slow, so the limit is generous. */
const eventually = (check: () => void | Promise<void>): Promise<void> =>
  vi.waitFor(check, { timeout: 20_000, interval: 10 });

/** A promise that the test resolves by hand. */
const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const planStep = (over: Partial<ScriptedStep> = {}): ScriptedStep => ({
  role: "planner",
  output: planOutput(),
  ...over
});
const buildStep = (over: Partial<ScriptedStep> = {}): ScriptedStep => ({
  role: "builder",
  output: builderOutput(),
  effect: (run) => writeFeature(run),
  ...over
});
const reviewStep = (): ScriptedStep => ({ role: "reviewer", output: reviewOutput() });

const stateOf = async (e: PipelineEnv, issue = ISSUE): Promise<IssueState> => {
  const read = await e.store.read(issue);
  if (read.status !== "ok") throw new Error(`state is ${read.status}`);
  return read.state;
};

/** Each issue number gets its own snapshot, so one environment can drive several issues. */
const multiIssue = (e: PipelineEnv, over: Partial<PipelineDeps> = {}): PipelineRunner =>
  createPipelineRunner({
    ...e.deps,
    github: { ...e.github, fetchIssue: (n) => Promise.resolve(snapshotOf({ number: n })) },
    ...over
  });

describe("agent slots", () => {
  it("never runs two agents at once when maxConcurrentAgents is 1", async () => {
    const first = deferred();
    const second = deferred();
    const e = await open({
      steps: [planStep({ hold: first.promise }), planStep({ hold: second.promise })],
      config: { maxConcurrentAgents: 1 }
    });
    const pipeline = multiIssue(e);

    const one = pipeline.start(7, { override: false });
    const two = pipeline.start(8, { override: false });
    await eventually(() => expect(e.runner.active()).toBe(1));
    await eventually(() => expect(e.deps.scheduler?.agent.waiting()).toBe(1));
    // The second issue waits for the slot. It is `running`, but no agent runs for it.
    expect(e.runner.requests).toHaveLength(1);

    first.resolve();
    await eventually(() => expect(e.runner.requests).toHaveLength(2));
    second.resolve();
    const results = await Promise.all([one, two]);
    expect(results.map((result) => result.outcome === "stopped" && result.stop)).toEqual([
      "gate",
      "gate"
    ]);
    expect(e.runner.maxActive()).toBe(1);
    expect(e.deps.scheduler?.agent.active()).toBe(0);
  });

  it("runs two agents together when two slots are free", async () => {
    const release = deferred();
    const e = await open({
      steps: [planStep({ hold: release.promise }), planStep({ hold: release.promise })],
      config: { maxConcurrentAgents: 2 }
    });
    const pipeline = multiIssue(e);
    const both = Promise.all([
      pipeline.start(7, { override: false }),
      pipeline.start(8, { override: false })
    ]);
    await eventually(() => expect(e.runner.active()).toBe(2));
    release.resolve();
    await both;
    expect(e.runner.maxActive()).toBe(2);
  });

  it("holds no agent slot at a gate", async () => {
    const e = await open({ steps: [planStep()], config: { maxConcurrentAgents: 1 } });
    await e.pipeline.start(ISSUE, { override: false });
    expect(await stateOf(e)).toMatchObject({ stage: "plan-gate" });
    expect(e.deps.scheduler?.agent.active()).toBe(0);
  });
});

describe("check slot", () => {
  it("runs one check at a time across issues", async () => {
    const gate = deferred();
    const e = await open({
      steps: [planStep(), planStep(), buildStep(), buildStep(), reviewStep(), reviewStep()],
      config: { maxConcurrentAgents: 2 }
    });
    let active = 0;
    let maxActive = 0;
    let started = 0;
    const exec: PipelineDeps["exec"] = async (request) => {
      if (request.argv[1] === "check:affected") {
        active += 1;
        started += 1;
        maxActive = Math.max(maxActive, active);
        await gate.promise;
        active -= 1;
      }
      return e.pnpm.exec(request);
    };
    const pipeline = multiIssue(e, { exec });
    await pipeline.start(7, { override: false });
    await pipeline.start(8, { override: false });

    const both = Promise.all([pipeline.approvePlan(7), pipeline.approvePlan(8)]);
    // The first check holds the slot and waits at the gate. The second waits for the slot.
    await eventually(() => {
      expect(started).toBe(1);
      expect(e.deps.scheduler?.check.waiting()).toBe(1);
    });
    expect(active).toBe(1);
    gate.resolve();
    const results = await both;
    expect(results.every((result) => result.outcome === "stopped" && result.stop === "gate")).toBe(
      true
    );
    expect(maxActive).toBe(1);
    expect(started).toBe(2);
  });
});

describe("one issue, one action at a time", () => {
  it("queues actions for an issue in order", async () => {
    const e = await open({ steps: [planStep(), buildStep(), reviewStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    const [first, second] = await Promise.all([
      e.pipeline.approvePlan(ISSUE),
      e.pipeline.approvePlan(ISSUE)
    ]);
    expect(first).toMatchObject({ outcome: "stopped", stop: "gate" });
    // The second approval ran after the first finished, so the gate was behind it.
    expect(second).toMatchObject({ outcome: "refused", refusal: "invalid-transition" });
    expect(e.runner.requests.filter((request) => request.role === "builder")).toHaveLength(1);
  });
});

describe("lease", () => {
  it("refuses a second driver and says who holds the issue", async () => {
    const release = deferred();
    const e = await open({ steps: [planStep({ hold: release.promise }), planStep()] });
    const first = e.pipeline.start(ISSUE, { override: false });
    await eventually(() => expect(e.runner.active()).toBe(1));

    const other = e.secondRunner();
    const refused = await other.advance(ISSUE);
    expect(refused).toMatchObject({ outcome: "refused", refusal: "leased" });
    expect(refused.outcome === "refused" && refused.reason).toContain(`pid ${process.pid}`);
    expect(await other.cancel(ISSUE)).toMatchObject({ outcome: "refused", refusal: "leased" });
    expect(await other.remove(ISSUE)).toMatchObject({ outcome: "refused", refusal: "leased" });
    // The refusals changed nothing.
    expect(await stateOf(e)).toMatchObject({ stage: "plan", status: "running" });

    release.resolve();
    await first;
    // The lease is free again once the first driver is done.
    expect(await other.advance(ISSUE)).toMatchObject({ outcome: "stopped", stop: "gate" });
  });

  it("refuses actions for an issue that has no state, and creates nothing", async () => {
    const e = await open();
    for (const result of [
      await e.pipeline.advance(99),
      await e.pipeline.approvePlan(99),
      await e.pipeline.continueFrom(99),
      await e.pipeline.cancel(99),
      await e.pipeline.ship(99, { confirm: true })
    ]) {
      expect(result).toMatchObject({ outcome: "refused", refusal: "unknown-issue" });
    }
    expect(await e.store.list()).toEqual([]);
  });

  it("refuses an unreadable state", async () => {
    const e = await open();
    await mkdir(e.store.issueDir(ISSUE), { recursive: true });
    await writeFile(e.store.statePath(ISSUE), "{not json");
    expect(await e.pipeline.advance(ISSUE)).toMatchObject({
      outcome: "refused",
      refusal: "unreadable"
    });
  });
});

describe("cancel", () => {
  it("stops a running agent, frees its slot, ends the issue and keeps the worktree", async () => {
    const hold = deferred();
    const e = await open({ steps: [planStep(), buildStep({ hold: hold.promise, pid: 4242 })] });
    await e.pipeline.start(ISSUE, { override: false });
    const running = e.pipeline.approvePlan(ISSUE);
    await eventually(() => expect(e.runner.active()).toBe(1));

    const cancelled = await e.pipeline.cancel(ISSUE);
    expect(cancelled).toMatchObject({ outcome: "stopped", stop: "cancelled" });
    expect(await running).toMatchObject({ outcome: "stopped" });
    expect(await stateOf(e)).toMatchObject({
      stage: "cancelled",
      status: "done",
      activeProcess: null
    });
    expect(e.deps.scheduler?.agent.active()).toBe(0);
    expect(e.fake?.trees()).toContain(e.worktree());
    // A cancelled issue is terminal.
    expect(await e.pipeline.advance(ISSUE)).toMatchObject({ stop: "cancelled" });
    expect(await e.pipeline.cancel(ISSUE)).toMatchObject({
      outcome: "refused",
      refusal: "invalid-transition"
    });
    // The label is cleared for a cancelled issue.
    expect(e.github.labelEdits.at(-1)?.change).toEqual({ add: [], remove: ["agent:working"] });
  });

  it("cancels an issue that waits at a gate", async () => {
    const e = await open({ steps: [planStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    expect(await e.pipeline.cancel(ISSUE)).toMatchObject({ stop: "cancelled" });
    expect((await stateOf(e)).history.at(-1)).toMatchObject({ event: "cancelled" });
  });
});

describe("remove", () => {
  it("refuses a dirty worktree, removes it with force, and keeps the branch", async () => {
    const e = await open({
      steps: [planStep(), buildStep({ output: builderOutput({ blockers: ["x"] }) })]
    });
    await e.pipeline.start(ISSUE, { override: false });
    await e.pipeline.approvePlan(ISSUE); // the builder writes files, then reports a blocker

    const refused = await e.pipeline.remove(ISSUE);
    expect(refused).toMatchObject({ outcome: "refused", refusal: "worktree-dirty" });
    expect(refused.outcome === "refused" && refused.reason).toContain("src/feature.ts");
    expect(await stateOf(e)).toMatchObject({ stage: "needs-you" });
    expect(e.fake?.trees()).toContain(e.worktree());

    const removed = await e.pipeline.remove(ISSUE, { force: true });
    expect(removed).toEqual({
      outcome: "removed",
      worktreeRemoved: true,
      branch: "KAINE-7-feat-export-reports"
    });
    expect(await e.store.read(ISSUE)).toEqual({ status: "missing" });
    expect(e.fake?.trees()).toEqual([]);
    expect(await e.deps.git.branchExists(e.repoRoot, "KAINE-7-feat-export-reports")).toBe(true);
  });

  it("removes a clean issue without force and clears its label", async () => {
    const e = await open({ steps: [planStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    expect(await e.pipeline.remove(ISSUE)).toMatchObject({ outcome: "removed" });
    expect(e.github.labelEdits.at(-1)?.change.add).toEqual([]);
    expect(await e.store.list()).toEqual([]);
  });

  it("keeps the worktree on disk with keepWorktree, and skips the dirty check", async () => {
    const e = await open({
      steps: [planStep(), buildStep({ output: builderOutput({ blockers: ["x"] }) })]
    });
    await e.pipeline.start(ISSUE, { override: false });
    await e.pipeline.approvePlan(ISSUE); // the worktree now holds uncommitted files

    expect(await e.pipeline.remove(ISSUE, { keepWorktree: true })).toEqual({
      outcome: "removed",
      worktreeRemoved: false,
      branch: "KAINE-7-feat-export-reports"
    });
    expect(await e.store.read(ISSUE)).toEqual({ status: "missing" });
    expect(e.fake?.trees()).toContain(e.worktree());
  });

  it("stops a running agent first", async () => {
    const hold = deferred();
    const e = await open({ steps: [planStep({ hold: hold.promise })] });
    const running = e.pipeline.start(ISSUE, { override: false });
    await eventually(() => expect(e.runner.active()).toBe(1));
    expect(await e.pipeline.remove(ISSUE)).toMatchObject({ outcome: "removed" });
    await running;
    expect(await e.store.list()).toEqual([]);
    expect(e.deps.scheduler?.agent.active()).toBe(0);
  });

  it("removes nothing for an issue that has no state", async () => {
    const e = await open();
    expect(await e.pipeline.remove(99)).toMatchObject({ outcome: "removed", branch: null });
  });
});

describe("restart and ship", () => {
  it("turns a leftover running state into needs-you on advance and never resumes it", async () => {
    const e = await open({ steps: [planStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    const state = await stateOf(e);
    // A desk process died while it ran the builder.
    await e.store.write({
      ...state,
      stage: "build",
      status: "running",
      activeProcess: {
        pid: 2_000_000_000,
        role: "builder",
        processStart: null,
        startedAt: "2026-10-07T09:00:00.000Z"
      }
    });
    const before = e.runner.requests.length;
    const result = await e.pipeline.advance(ISSUE);
    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    expect(await stateOf(e)).toMatchObject({
      stage: "needs-you",
      resumeStage: "build",
      activeProcess: null
    });
    expect(result.outcome === "stopped" && result.message).toContain("Interrupted");
    expect(e.runner.requests).toHaveLength(before);
  });

  it("refuses ship without confirmation, with a typed error and no side effect", async () => {
    const e = await open({ steps: [planStep(), buildStep(), reviewStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    expect(await e.pipeline.ship(ISSUE, { confirm: true })).toMatchObject({
      outcome: "refused",
      refusal: "invalid-transition"
    });
    await e.pipeline.approvePlan(ISSUE);
    const before = await readFile(e.store.statePath(ISSUE), "utf8");
    const commentsBefore = e.github.comments.length;
    expect(await e.pipeline.ship(ISSUE, { confirm: false })).toMatchObject({
      outcome: "refused",
      refusal: "ship-refused"
    });
    expect(await readFile(e.store.statePath(ISSUE), "utf8")).toBe(before);
    expect(e.github.comments).toHaveLength(commentsBefore);
  });

  it("lists status with the needs-you reason", async () => {
    const e = await open({
      steps: [
        planStep({ output: undefined, failure: { kind: "no-result", message: "stream ended" } })
      ]
    });
    await e.pipeline.start(ISSUE, { override: false });
    const [entry] = await e.pipeline.status(ISSUE);
    expect(entry?.needsYouReason).toContain("stream ended");
    expect((await e.pipeline.status()).map((item) => item.issueNumber)).toEqual([ISSUE]);
    expect(await e.pipeline.status(99)).toEqual([
      { issueNumber: 99, result: { status: "missing" }, needsYouReason: null }
    ]);
  });
});

describe("start with a snapshot file", () => {
  const fileFor = async (e: PipelineEnv, content: unknown): Promise<string> => {
    const file = path.join(e.scratch.root, "snapshot.json");
    await writeFile(file, typeof content === "string" ? content : JSON.stringify(content));
    return file;
  };

  it("runs without GitHub and writes nothing to it", async () => {
    const e = await open({ steps: [planStep()], github: { failRead: true } });
    const snapshot = snapshotOf({ number: ISSUE, labelEvents: [] });
    const file = await fileFor(e, snapshot);
    const result = await e.pipeline.start(ISSUE, { override: true, snapshotFile: file });
    expect(result).toMatchObject({ outcome: "stopped", stop: "gate" });
    expect(await stateOf(e)).toMatchObject({ authorization: { override: true } });
    expect(e.github.labelEdits).toEqual([]);
    expect(e.github.comments).toEqual([]);
  });

  it("needs --override because a file is not a trusted source", async () => {
    const e = await open();
    const file = await fileFor(e, snapshotOf({ number: ISSUE }));
    expect(await e.pipeline.start(ISSUE, { override: false, snapshotFile: file })).toMatchObject({
      outcome: "refused",
      refusal: "authorization"
    });
    expect(await e.store.list()).toEqual([]);
  });

  it.each([
    ["a missing file", () => "/nonexistent/snapshot.json", "Cannot read"],
    ["invalid JSON", () => "bad-json", "not valid JSON"]
  ])("refuses %s", async (_name, make, text) => {
    const e = await open();
    const target = make();
    const file = target === "bad-json" ? await fileFor(e, "{nope") : target;
    const result = await e.pipeline.start(ISSUE, { override: true, snapshotFile: file });
    expect(result).toMatchObject({ outcome: "refused", refusal: "intake-refused" });
    expect(result.outcome === "refused" && result.reason).toContain(text);
  });

  it("refuses a snapshot for another issue and a malformed snapshot", async () => {
    const e = await open();
    const other = await fileFor(e, snapshotOf({ number: 9 }));
    expect(await e.pipeline.start(ISSUE, { override: true, snapshotFile: other })).toMatchObject({
      refusal: "intake-refused"
    });
    const bad = await fileFor(e, { number: ISSUE });
    const result = await e.pipeline.start(ISSUE, { override: true, snapshotFile: bad });
    expect(result.outcome === "refused" && result.reason).toContain("issue snapshot format");
  });

  it("refuses a second start for an issue that is past intake", async () => {
    const e = await open({ steps: [planStep()] });
    await e.pipeline.start(ISSUE, { override: false });
    expect(await e.pipeline.start(ISSUE, { override: false })).toMatchObject({
      outcome: "refused",
      refusal: "already-started"
    });
  });
});
