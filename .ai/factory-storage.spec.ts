import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { cancelContainers, docker } from "./factory-docker";
import { finishStorage, candidateVolume, dependencyVolume } from "./factory-storage";
import { FactoryStore } from "./factory-store";
import { factoryConfigSchema, factoryRunSchema } from "./factory.util";

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  execFileSync: vi.fn()
}));
vi.mock("./factory-docker", () => ({ docker: vi.fn(), cancelContainers: vi.fn() }));
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
  if (path.dirname(directory) !== path.resolve(tmpdir()))
    throw new Error("Unexpected test directory");
  rmSync(directory, { recursive: true, force: true });
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
