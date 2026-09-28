import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { docker } from "./factory-docker";
import { FactoryStore } from "./factory-store";
import { prepareDependencyDownload, validateWorkspace } from "./factory-validation";
import { factoryConfigSchema, factoryRunSchema } from "./factory.util";
import { runModelProcess } from "./model-process.util";

vi.mock("./factory-docker", () => ({ docker: vi.fn(() => "") }));
vi.mock("./model-process.util", () => ({ runModelProcess: vi.fn() }));
let directory: string;
let workspace: string;
let store: FactoryStore;
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
beforeEach(() => {
  vi.clearAllMocks();
  directory = mkdtempSync(path.join(tmpdir(), "factory-download-"));
  workspace = path.join(directory, "candidate");
  mkdirSync(workspace);
  store = new FactoryStore(path.join(directory, "runs"));
  writeFileSync(path.join(workspace, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  vi.mocked(runModelProcess).mockResolvedValue({
    termination: "completed",
    exitCode: 0,
    cleanup: "passed"
  });
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
it("only exposes the lock and registered patch data during downloads", () => {
  writeFileSync(
    path.join(workspace, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\npatchedDependencies:\n  example@1:\n    path: patches/example.patch\n"
  );
  mkdirSync(path.join(workspace, "patches"));
  writeFileSync(path.join(workspace, "patches/example.patch"), "patch data");
  for (const file of [
    ".pnpmfile.cjs",
    ".npmrc",
    "package.json",
    "pnpm-workspace.yaml",
    "private-source.ts"
  ])
    writeFileSync(path.join(workspace, file), "untrusted");
  const download = prepareDependencyDownload(workspace, store.directory);
  expect(readdirSync(download).sort()).toEqual([
    "package.json",
    "patches",
    "pnpm-lock.yaml",
    "store"
  ]);
  expect(readFileSync(path.join(download, "patches/example.patch"), "utf8")).toBe("patch data");
  expect(JSON.parse(readFileSync(path.join(download, "package.json"), "utf8"))).toEqual({
    private: true,
    packageManager: "pnpm@10.29.3"
  });
});
it.each(["../private", "src/secret.ts", "patches/../private.patch"])(
  "rejects download patch path %s",
  (file) => {
    writeFileSync(
      path.join(workspace, "pnpm-lock.yaml"),
      `patchedDependencies:\n  example:\n    path: ${file}\n`
    );
    expect(() => prepareDependencyDownload(workspace, store.directory)).toThrow("patch path");
  }
);
it("rejects symlinked patches before copying their target", () => {
  writeFileSync(
    path.join(workspace, "pnpm-lock.yaml"),
    "patchedDependencies:\n  example:\n    path: patches/example.patch\n"
  );
  const outside = path.join(directory, "outside");
  mkdirSync(outside);
  writeFileSync(path.join(outside, "example.patch"), "private");
  symlinkSync(outside, path.join(workspace, "patches"), "junction");
  expect(() => prepareDependencyDownload(workspace, store.directory)).toThrow("Symlink");
});
it("uses the network only for the isolated download directory, then installs offline", async () => {
  const run = factoryRunSchema.parse({
    id: randomUUID(),
    issue: 1,
    stage: "implement",
    provider: "codex",
    model: "model",
    revision: "a".repeat(40),
    authorization: "1",
    snapshot: "snapshot",
    startedAt: "now",
    finishedAt: null,
    status: "running",
    detail: "",
    branch: "branch",
    pr: null,
    validation: [],
    result: null,
    invocations: []
  });
  const release = store.acquire(run.id);
  try {
    expect(await validateWorkspace(config, run, store, workspace, "docs", ["README.md"])).toBe(
      true
    );
    const calls = vi.mocked(runModelProcess).mock.calls.map(([input]) => input.args);
    expect(calls[0]).toEqual(
      expect.arrayContaining(["bridge", "fetch", "--ignore-pnpmfile", "--ignore-scripts"])
    );
    expect(calls[0]).not.toContain(`type=bind,src=${workspace},dst=/workspace`);
    expect(calls[1]).toEqual(
      expect.arrayContaining([
        "none",
        "install",
        "--offline",
        `type=bind,src=${workspace},dst=/workspace`
      ])
    );
    for (const args of calls.slice(1)) expect(args[args.indexOf("--network") + 1]).toBe("none");
    expect(docker).toHaveBeenCalled();
  } finally {
    release();
  }
});
