import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IssueState } from "../contracts";
import { recoverInterrupted, type RecoveryDeps } from "./pipeline.recovery";
import { createIssueStore, type IssueStore } from "../store/store.issue";
import { defaultIsProcessAlive, defaultProcessStart } from "../store/store.lease";
import { spawnOrphanLeader } from "../testing/process.testing";

vi.setConfig({ testTimeout: 30_000 });

let root: string;
let store: IssueStore;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "desk-recovery-"));
  store = createIssueStore(root);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const AT = "2026-10-07T09:00:00.000Z";
const NOW = new Date("2026-10-07T10:00:00Z");

const seed = async (over: Partial<IssueState> = {}): Promise<IssueState> => {
  const state: IssueState = {
    schemaVersion: 1,
    issueNumber: 7,
    stage: "build",
    status: "running",
    resumeStage: null,
    branch: "KAINE-7-feat-x",
    worktreePath: "/work/KAINE-7",
    sessions: { planner: "p1", builder: "b1" },
    loops: { check: 1, review: 0 },
    lastCheckFingerprint: "abc",
    history: [{ at: AT, stage: "build", event: "stage-started" }],
    authorization: null,
    createdAt: AT,
    updatedAt: AT,
    ...over
  };
  await store.write(state);
  return state;
};

const read = async (issue = 7): Promise<IssueState> => {
  const result = await store.read(issue);
  if (result.status !== "ok") throw new Error(`state is ${result.status}`);
  return result.state;
};

/** A process table and a stop function the test controls. */
const table = (alive: Record<number, string | null>) => {
  const stopped: number[] = [];
  const deps: RecoveryDeps = {
    clock: { now: () => NOW },
    isProcessAlive: (pid) => pid in alive,
    processStart: (pid) => Promise.resolve(alive[pid] ?? null),
    stopGroup: (pid) => {
      stopped.push(pid);
      return Promise.resolve("passed");
    },
    lease: {
      pid: 1,
      isProcessAlive: (pid) => pid in alive,
      processStart: (pid) => Promise.resolve(alive[pid] ?? null)
    }
  };
  return { deps, stopped };
};

const agent = (pid: number, processStart: string | null) => ({
  pid,
  role: "builder" as const,
  processStart,
  startedAt: AT
});

describe("recoverInterrupted", () => {
  it.each(["running", "queued"] as const)(
    "turns a %s issue into needs-you with its stage and a note, and keeps the rest",
    async (status) => {
      await seed({ status });
      const { deps } = table({ 1: "me" });
      const entries = await recoverInterrupted(store, deps);

      expect(entries).toEqual([{ issueNumber: 7, action: "marked-needs-you", stage: "build" }]);
      const state = await read();
      expect(state).toMatchObject({
        stage: "needs-you",
        status: "waiting",
        resumeStage: "build",
        activeProcess: null,
        sessions: { planner: "p1", builder: "b1" },
        loops: { check: 1, review: 0 },
        branch: "KAINE-7-feat-x"
      });
      const last = state.history.at(-1);
      expect(last).toMatchObject({
        stage: "needs-you",
        event: "interrupted",
        at: NOW.toISOString()
      });
      expect(last?.note).toContain(`'build' was ${status}`);
      expect(last?.note).toContain("Continue to retry 'build'");
      // The note is also in events.jsonl.
      expect(await readFile(store.eventsPath(7), "utf8")).toContain("interrupted");
    }
  );

  it("records a process that is already gone and stops nothing", async () => {
    await seed({ activeProcess: agent(4321, "t1") });
    const { deps, stopped } = table({});
    const [entry] = await recoverInterrupted(store, deps);
    expect(entry?.processNote).toContain("already gone");
    expect(stopped).toEqual([]);
    expect((await read()).activeProcess).toBeNull();
  });

  it("stops a live leftover agent whose start time matches", async () => {
    await seed({ activeProcess: agent(4321, "Tue Oct 7 08:59:00 2026") });
    const { deps, stopped } = table({ 4321: "Tue Oct 7 08:59:00 2026" });
    const [entry] = await recoverInterrupted(store, deps);
    expect(stopped).toEqual([4321]);
    expect(entry?.processNote).toContain("Stopped the agent process group");
    expect((await read()).history.at(-1)?.note).toContain("Stopped the agent process group");
  });

  it.each([
    [
      "a different start time (the pid was reused)",
      "Tue Oct 7 09:30:00 2026",
      "Tue Oct 7 08:59:00 2026"
    ],
    ["no recorded start time", "Tue Oct 7 08:59:00 2026", null]
  ])("leaves a live process alone when it has %s", async (_name, current, recorded) => {
    await seed({ activeProcess: agent(4321, recorded) });
    const { deps, stopped } = table({ 4321: current });
    const [entry] = await recoverInterrupted(store, deps);
    expect(stopped).toEqual([]);
    expect(entry?.processNote).toContain("may not be the agent process");
    expect(await read()).toMatchObject({ stage: "needs-you", activeProcess: null });
  });

  it("says so when the process group cannot be stopped", async () => {
    await seed({ activeProcess: agent(4321, "t1") });
    const { deps } = table({ 4321: "t1" });
    const [entry] = await recoverInterrupted(store, {
      ...deps,
      stopGroup: () => Promise.resolve("failed")
    });
    expect(entry?.processNote).toContain("Could not stop");
  });

  it("takes over a stale lease and releases it afterwards", async () => {
    await seed();
    await writeFile(
      store.leasePath(7),
      JSON.stringify({ token: "old", pid: 999, processStart: "t0", acquiredAt: AT })
    );
    const { deps } = table({ 1: "me" }); // pid 999 is not in the table: dead
    const entries = await recoverInterrupted(store, deps);
    expect(entries[0]?.action).toBe("marked-needs-you");
    await expect(readFile(store.leasePath(7), "utf8")).rejects.toThrow();
  });

  it("leaves an issue alone while a live desk process holds its lease", async () => {
    await seed();
    await writeFile(
      store.leasePath(7),
      JSON.stringify({ token: "live", pid: 555, processStart: "t5", acquiredAt: AT })
    );
    const { deps } = table({ 555: "t5" });
    const entries = await recoverInterrupted(store, deps);
    expect(entries).toEqual([{ issueNumber: 7, action: "left-running", stage: "build" }]);
    expect(await read()).toMatchObject({ stage: "build", status: "running" });
  });

  it("settles the status of a gate that claims to run, without a needs-you", async () => {
    await seed({ stage: "plan-gate", status: "running" });
    await recoverInterrupted(store, table({}).deps);
    expect(await read()).toMatchObject({
      stage: "plan-gate",
      status: "waiting",
      resumeStage: null
    });
  });

  it("does not touch issues that are not running", async () => {
    await seed({ issueNumber: 1, stage: "plan-gate", status: "waiting" });
    await seed({ issueNumber: 2, stage: "needs-you", status: "waiting", resumeStage: "check" });
    await seed({ issueNumber: 3, stage: "shipped", status: "done" });
    const before = await Promise.all([1, 2, 3].map((n) => read(n)));
    expect(await recoverInterrupted(store, table({}).deps)).toEqual([]);
    expect(await Promise.all([1, 2, 3].map((n) => read(n)))).toEqual(before);
  });

  it("reports an unreadable issue and still recovers the others", async () => {
    await seed({ issueNumber: 1 });
    await seed({ issueNumber: 2, stage: "check", status: "queued" });
    await writeFile(store.statePath(1), "{broken");
    const entries = await recoverInterrupted(store, table({}).deps);
    expect(entries).toEqual([
      { issueNumber: 1, action: "unreadable" },
      { issueNumber: 2, action: "marked-needs-you", stage: "check" }
    ]);
    expect(await read(2)).toMatchObject({ stage: "needs-you", resumeStage: "check" });
  });

  it("recovers an intake that was running", async () => {
    await seed({ stage: "intake", status: "running" });
    await recoverInterrupted(store, table({}).deps);
    expect(await read()).toMatchObject({ stage: "needs-you", resumeStage: "intake" });
  });

  it("is idempotent: a second run changes nothing", async () => {
    await seed();
    const { deps } = table({});
    await recoverInterrupted(store, deps);
    const once = await read();
    expect(await recoverInterrupted(store, deps)).toEqual([]);
    expect(await read()).toEqual(once);
  });
});

describe("recovery with a real leftover process", () => {
  it("stops the process group of an agent that outlived its desk", async () => {
    // A leader that is not our child stands in for the agent that a `kill -9` of the desk leaves behind.
    const pid = await spawnOrphanLeader();
    try {
      await seed({ activeProcess: agent(pid, await defaultProcessStart(pid)) });
      expect(defaultIsProcessAlive(pid)).toBe(true);

      const [entry] = await recoverInterrupted(store, { clock: { now: () => NOW } });
      expect(entry?.action).toBe("marked-needs-you");
      expect(entry?.processNote).toContain("Stopped the agent process group");
      expect(defaultIsProcessAlive(pid)).toBe(false);
    } finally {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // Already gone: that is the expected case.
      }
    }
  });
});

describe("recovery with an isolation cleanup", () => {
  it("adds the cleanup note, and runs it even when no process was recorded", async () => {
    await seed({ isolation: "docker" });
    const asked: number[] = [];
    const { deps } = table({ 1: "me" });
    const [entry] = await recoverInterrupted(store, {
      ...deps,
      cleanupIsolation: (state) => {
        asked.push(state.issueNumber);
        return Promise.resolve("Removed 1 Docker container(s) that a stopped run left.");
      }
    });
    expect(asked).toEqual([7]);
    expect(entry?.processNote).toBe("Removed 1 Docker container(s) that a stopped run left.");
    const last = (await read()).history.at(-1);
    expect(last?.note).toContain("Removed 1 Docker container(s)");
    expect(last?.note).toContain("Continue to retry 'build'");
  });

  it("joins the process note and the isolation note", async () => {
    await seed({ isolation: "docker", activeProcess: agent(4321, "t1") });
    const { deps } = table({});
    const [entry] = await recoverInterrupted(store, {
      ...deps,
      cleanupIsolation: () => Promise.resolve("Removed 2 containers.")
    });
    expect(entry?.processNote).toContain("already gone");
    expect(entry?.processNote).toContain("Removed 2 containers.");
  });

  it("changes nothing for a recovery without an isolation cleanup", async () => {
    await seed();
    const { deps } = table({ 1: "me" });
    const [entry] = await recoverInterrupted(store, deps);
    expect(entry?.processNote).toBeUndefined();
  });
});
