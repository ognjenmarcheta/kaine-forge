import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { cancelContainers, docker } from "./factory-docker";
import { events } from "./factory-progress";
import {
  finishStorage,
  candidateVolume,
  dependencyVolume,
  initializeCandidate,
  resources
} from "./factory-storage";
import { FactoryStore } from "./factory-store";
import { git } from "./factory-workspace";
import { factoryConfigSchema, factoryRunSchema } from "./factory.util";

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  execFileSync: vi.fn()
}));
vi.mock("./factory-docker", () => ({ docker: vi.fn(), cancelContainers: vi.fn() }));
vi.mock("./factory-workspace", async (original) => ({
  ...(await original<typeof import("./factory-workspace")>()),
  git: vi.fn()
}));
const config = factoryConfigSchema.parse({
  enabled: false,
  repository: "owner/repo",
  owner: "owner",
  image: `sha256:${"a".repeat(64)}`,
  models: { codex: "model", claude: "model" },
  stages: Object.fromEntries(
    ["intake", "spec", "implement", "review", "learn"].map((stage) => [
      stage,
      { provider: "codex", model: "model" }
    ])
  )
});
const fixture = () =>
  factoryRunSchema.parse({
    id: randomUUID(),
    issue: 1,
    stage: "implement",
    provider: "codex",
    model: "model",
    revision: "a".repeat(40),
    authorization: "owner",
    snapshot: "snapshot",
    startedAt: "now",
    finishedAt: null,
    status: "failed",
    detail: "Offline install failed",
    branch: "",
    pr: null,
    validation: [],
    result: null,
    invocations: []
  });
let directory: string;
let store: FactoryStore;
beforeEach(() => {
  vi.resetAllMocks();
  directory = mkdtempSync(path.join(tmpdir(), "kaine-storage-test-"));
  store = new FactoryStore(path.join(directory, "runs"));
  vi.mocked(docker).mockReturnValue("");
});
afterEach(() => {
  vi.restoreAllMocks();
  if (path.dirname(directory) !== path.resolve(tmpdir()))
    throw new Error("Unexpected test directory");
  rmSync(directory, { recursive: true, force: true });
});
it.each([false, true])(
  "removes the exact source bundle after initialization (failure=%s)",
  (fail) => {
    const run = fixture();
    const transfer = path.join(directory, "transfers", run.id);
    vi.mocked(git).mockImplementation(() => {
      writeFileSync(path.join(transfer, "source.bundle"), "source");
      return "";
    });
    vi.mocked(execFileSync).mockImplementation(() => {
      if (fail) throw new Error("Init failed");
      return "";
    });
    if (fail)
      expect(() => initializeCandidate(config, run, store, directory, [])).toThrow("Init failed");
    else initializeCandidate(config, run, store, directory, []);
    expect(existsSync(transfer)).toBe(false);
  }
);
it("keeps the original initialization failure when transfer cleanup also fails", () => {
  const run = fixture();
  vi.mocked(execFileSync).mockImplementation(() => {
    writeFileSync(path.join(directory, "transfers", run.id, "unrelated.txt"), "retain me");
    throw new Error("Init failed");
  });
  expect(() => initializeCandidate(config, run, store, directory, [], false)).toThrow(
    "Init failed"
  );
  expect(events(store, run.id).events.at(-1)?.detail).toBe("Source bundle cleanup failed");
});
it("requires source export after a partially applied proposal", () => {
  const run = fixture();
  vi.mocked(execFileSync)
    .mockReturnValueOnce("")
    .mockImplementationOnce(() => {
      throw new Error("Apply failed");
    });
  expect(() => initializeCandidate(config, run, store, directory, [], false)).toThrow(
    "Apply failed"
  );
  expect(resources(store, run.id)?.ready).toBe(true);
});
it("records truncation warnings and clears an old failure after verified cleanup without a manifest", () => {
  const run = fixture();
  run.cleanup = { status: "cleanup-unverified", errors: ["Old failure"] };
  expect(finishStorage(config, run, store)).toBe(true);
  expect(cancelContainers).toHaveBeenCalledWith(run.id);
  expect(run.cleanup).toEqual({ status: "passed", errors: [] });
  store.write(`${run.id}.resources.json`, {
    version: 1,
    image: config.image,
    volumes: [],
    ready: true
  });
  vi.mocked(execFileSync).mockReturnValue(
    JSON.stringify({ files: [], warnings: ["Optional evidence truncated: byte limit exceeded"] })
  );
  expect(finishStorage(config, run, store)).toBe(true);
  expect(events(store, run.id).events.some((event) => event.detail.includes("truncated"))).toBe(
    true
  );
});
it("retains the install failure and all volumes when recovery export fails", () => {
  const run = fixture();
  store.write(`${run.id}.resources.json`, {
    version: 1,
    image: config.image,
    volumes: [candidateVolume(run.id), dependencyVolume(run.id)],
    ready: true
  });
  vi.mocked(execFileSync).mockImplementation(() => {
    throw new Error("Export failed");
  });
  expect(finishStorage(config, run, store)).toBe(false);
  expect(run.detail).toBe("Offline install failed");
  expect(run.cleanup?.errors).toEqual(["Export failed"]);
  expect(vi.mocked(docker).mock.calls.some(([args]) => args.includes("rm"))).toBe(false);
});
it("cleans partial preparation and is idempotent after resources disappear", () => {
  const run = fixture();
  const volumes = new Set([candidateVolume(run.id), dependencyVolume(run.id)]);
  store.write(`${run.id}.resources.json`, {
    version: 1,
    image: config.image,
    volumes: [...volumes],
    ready: false
  });
  vi.mocked(docker).mockImplementation((args) => {
    if (args[1] === "ls")
      return [...volumes].filter((name) => args.at(-1)?.includes(name)).join("\n");
    if (args[1] === "inspect") return run.id;
    if (args[1] === "rm") volumes.delete(args[2] ?? "");
    return "";
  });
  expect(finishStorage(config, run, store)).toBe(true);
  expect(volumes.size).toBe(0);
  expect(finishStorage(config, run, store)).toBe(true);
  expect(run.cleanup?.status).toBe("passed");
  expect(execFileSync).not.toHaveBeenCalled();
});
it("rejects another run's volume before invoking Docker", () => {
  const run = fixture();
  store.write(`${run.id}.resources.json`, {
    version: 1,
    image: config.image,
    volumes: [candidateVolume(randomUUID())],
    ready: false
  });
  expect(finishStorage(config, run, store)).toBe(false);
  expect(cancelContainers).not.toHaveBeenCalled();
  expect(docker).not.toHaveBeenCalled();
});
it("retains a volume whose Docker owner label differs", () => {
  const run = fixture();
  const volume = candidateVolume(run.id);
  store.write(`${run.id}.resources.json`, {
    version: 1,
    image: config.image,
    volumes: [volume],
    ready: false
  });
  vi.mocked(docker).mockImplementation((args) => (args[1] === "ls" ? volume : "someone-else"));
  expect(finishStorage(config, run, store)).toBe(false);
  expect(run.cleanup?.errors).toEqual(["Volume ownership differs"]);
  expect(vi.mocked(docker).mock.calls.some(([args]) => args.includes("rm"))).toBe(false);
});
