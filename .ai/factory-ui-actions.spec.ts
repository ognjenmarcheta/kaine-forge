import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REPO_ROOT } from "./ai.util";
import { FactoryStore } from "./factory-store";
import { DashboardActions } from "./factory-ui-actions";
import type { FactoryRun } from "./factory.util";

vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});
let root: string;
let store: FactoryStore;
let actions: DashboardActions;
beforeEach(async () => {
  vi.clearAllMocks();
  root = mkdtempSync(path.join(tmpdir(), "kaine-ui-actions-"));
  store = new FactoryStore(path.join(root, "runs"));
  actions = new DashboardActions(store, root);
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  vi.mocked(spawn).mockImplementation((command, args, options) => {
    if (command === process.execPath)
      return actual.spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], options);
    return actual.spawn(command, args, options);
  });
});
afterEach(async () => {
  await actions.stop();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});
describe("persisted dashboard actions", () => {
  it("deduplicates a network retry and prevents two tabs from starting concurrent operations", () => {
    const request = { key: randomUUID(), kind: "doctor" as const };
    const first = actions.start(request);
    expect(actions.start(request).id).toBe(first.id);
    expect(vi.mocked(spawn).mock.calls.length).toBe(1);
    expect(() => actions.start({ key: randomUUID(), kind: "doctor" })).toThrow(
      "Another dashboard operation"
    );
    expect(() => actions.start({ key: request.key, kind: "refresh" })).toThrow("already used");
    expect(JSON.parse(readFileSync(store.file(`action-${first.id}.json`), "utf8")).id).toBe(
      first.id
    );
  });
  it("passes only a validated fixed CLI command and preserves subscription authentication outside arguments", () => {
    actions.start({
      key: randomUUID(),
      kind: "start",
      issue: 23,
      stage: "implement",
      provider: "claude"
    });
    expect(vi.mocked(spawn).mock.calls[0]?.[1]).toEqual([
      "--import",
      "tsx",
      path.join(REPO_ROOT, ".ai/factory.ts"),
      "run",
      "--issue",
      "23",
      "--stage",
      "implement",
      "--provider",
      "claude",
      "--checkout",
      root
    ]);
  });
  it("links an explicit retry while leaving branch and PR reuse to the controller", () => {
    const run: FactoryRun = {
      id: randomUUID(),
      issue: 23,
      stage: "implement",
      provider: "codex",
      model: "fixture",
      revision: "a".repeat(40),
      authorization: "owner",
      snapshot: "snapshot",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "failed",
      detail: "Publication failed",
      branch: "KAINE-23-feat-factory",
      pr: null,
      candidate: "b".repeat(40),
      validation: [],
      result: null,
      invocations: []
    };
    store.save(run);
    actions.start({ key: randomUUID(), kind: "retry", run: run.id });
    expect(vi.mocked(spawn).mock.calls[0]?.[2]?.env?.KAINE_FACTORY_RETRY_OF).toBe(run.id);
    expect(vi.mocked(spawn).mock.calls[0]?.[1]).toContain("23");
  });
  it("does not auto-restart interrupted actions", () => {
    const id = randomUUID();
    store.write(`action-${id}.json`, {
      id,
      request: { key: id, kind: "doctor" },
      state: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      runId: null,
      detail: ""
    });
    const restarted = new DashboardActions(store, root);
    expect(restarted.list()[0]?.state).toBe("cleanup-unverified");
    expect(vi.mocked(spawn).mock.calls.length).toBe(0);
  });
  it("stops its child process without cancelling an independent CLI-owned run", async () => {
    const independent = randomUUID();
    const release = store.acquire(independent);
    actions.start({ key: randomUUID(), kind: "doctor" });
    await actions.stop();
    expect(store.active()?.id).toBe(independent);
    expect(store.cancelled(independent)).toBe(false);
    expect(actions.list()[0]?.state).toBe("interrupted");
    release();
  });
});
