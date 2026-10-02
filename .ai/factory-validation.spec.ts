import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { docker, withDependencyProxy } from "./factory-docker";
import { readCandidateText, applyDependencyMetadata, resources } from "./factory-storage";
import { FactoryStore } from "./factory-store";
import { validateWorkspace, validationCommand } from "./factory-validation";
import { factoryConfigSchema, factoryRunSchema } from "./factory.util";
import { runModelProcess } from "./model-process.util";

vi.mock("./factory-docker", () => ({
  docker: vi.fn(() => ""),
  withDependencyProxy: vi.fn(async (_config, _id, action) => action("test-fetch-socket"))
}));
vi.mock("./factory-storage", () => ({
  candidateVolume: (id: string) => `kf-${id}-candidate`,
  dependencyVolume: (id: string) => `kf-${id}-dependencies`,
  readCandidateText: vi.fn(),
  applyDependencyMetadata: vi.fn(),
  resources: vi.fn()
}));
vi.mock("./model-process.util", () => ({ runModelProcess: vi.fn() }));
const config = factoryConfigSchema.parse({
  enabled: true,
  repository: "owner/project",
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
let directory: string;
let store: FactoryStore;
let release: () => void;
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
    status: "running",
    detail: "",
    branch: "",
    pr: null,
    validation: [],
    result: null,
    invocations: []
  });
beforeEach(() => {
  vi.resetAllMocks();
  directory = mkdtempSync(path.join(tmpdir(), "factory-volumes-test-"));
  store = new FactoryStore(path.join(directory, "runs"));
  vi.mocked(docker).mockReturnValue("");
  vi.mocked(readCandidateText).mockReturnValue("lockfileVersion: '9.0'\n");
  vi.mocked(resources).mockReturnValue({
    version: 1,
    image: config.image,
    volumes: [],
    ready: true,
    exported: false
  });
  vi.mocked(withDependencyProxy).mockImplementation(async (_config, _id, action) =>
    action("test-fetch-socket")
  );
  vi.mocked(runModelProcess).mockResolvedValue({
    termination: "completed",
    exitCode: 0,
    cleanup: "passed"
  });
});
afterEach(() => {
  release?.();
  rmSync(directory, { recursive: true, force: true });
});
it("fetches metadata alone, installs offline in volumes, and never mounts Windows dependency paths", async () => {
  const run = fixture();
  release = store.acquire(run.id);
  expect(await validateWorkspace(config, run, store, directory, "docs", ["README.md"])).toBe(true);
  const calls = vi.mocked(runModelProcess).mock.calls.map(([input]) => input.args);
  expect(calls[0]).toContain(`type=volume,src=kf-${run.id}-dependencies,dst=/workspace`);
  expect(calls[0]).toContain("type=volume,src=test-fetch-socket,dst=/socket,readonly");
  expect(calls[1]).toContain("--offline");
  expect(calls[1]).toContain(`type=volume,src=kf-${run.id}-candidate,dst=/workspace`);
  for (const args of calls) {
    expect(args.some((arg) => arg.startsWith("type=bind"))).toBe(false);
    expect(args[args.indexOf("--network") + 1]).toBe("none");
  }
  expect(vi.mocked(applyDependencyMetadata).mock.calls[0]?.[2].map((file) => file.path)).toEqual([
    "pnpm-lock.yaml",
    "package.json"
  ]);
});
it.each(["../private", "src/secret.ts", "patches/../secret.patch"])(
  "rejects dependency patch path %s",
  async (patch) => {
    const run = fixture();
    release = store.acquire(run.id);
    vi.mocked(readCandidateText).mockReturnValue(
      `patchedDependencies:\n  example:\n    path: ${patch}\n`
    );
    await expect(
      validateWorkspace(config, run, store, directory, "docs", ["README.md"])
    ).rejects.toThrow("patch path");
    expect(applyDependencyMetadata).not.toHaveBeenCalled();
  }
);
it.each(["fetch", "install"])(
  "stops infrastructure failure during %s without treating it as a model repair",
  async (stage) => {
    const run = fixture();
    release = store.acquire(run.id);
    if (stage === "install")
      vi.mocked(runModelProcess).mockResolvedValueOnce({
        termination: "completed",
        exitCode: 0,
        cleanup: "passed"
      });
    vi.mocked(runModelProcess).mockResolvedValueOnce({
      termination: "failed",
      exitCode: 1,
      cleanup: "passed"
    });
    await expect(
      validateWorkspace(config, run, store, directory, "docs", ["README.md"])
    ).rejects.toThrow(stage === "fetch" ? "fetch failed" : "install failed");
    expect(run.validation.at(-1)?.passed).toBe(false);
  }
);
it("publishes live redacted output only after split secret lines are complete", async () => {
  const run = fixture();
  release = store.acquire(run.id);
  vi.mocked(runModelProcess).mockImplementation(async (input) => {
    input.stdout?.(Buffer.from("Authorization: Bearer sec"));
    const log = store.file(`${run.id}.check-0.log`);
    expect(readFileSync(log, "utf8")).not.toContain("sec");
    input.stdout?.(Buffer.from("ret-value\nprogress 1\n"));
    expect(readFileSync(log, "utf8")).not.toContain("secret-value");
    return { termination: "completed", exitCode: 0, cleanup: "passed" };
  });
  expect(await validationCommand(config, run, store, directory, ["pnpm", "check"])).toBe(true);
  const output = readFileSync(store.file(run.validation[0]!.artifact), "utf8");
  expect(output).toContain("[redacted]");
  expect(output).toContain("progress 1");
  expect(run.currentCommand).toBeNull();
  expect(run.validation[0]?.finishedAt).toBeTruthy();
});
it("records command failure even when Docker cleanup cannot be verified", async () => {
  const run = fixture();
  release = store.acquire(run.id);
  vi.mocked(runModelProcess).mockResolvedValue({
    termination: "failed",
    exitCode: 1,
    cleanup: "passed"
  });
  vi.mocked(docker).mockImplementation(() => {
    throw new Error("Docker unavailable");
  });
  await expect(
    validationCommand(config, run, store, directory, ["pnpm", "install"])
  ).rejects.toThrow("cleanup");
  expect(run.validation).toHaveLength(1);
  expect(run.validation[0]?.passed).toBe(false);
});
