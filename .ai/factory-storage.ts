import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { docker, cancelContainers } from "./factory-docker";
import { registerArtifact, progress } from "./factory-progress";
import type { FactoryStore } from "./factory-store";
import { git, safeDestination } from "./factory-workspace";
import { type FactoryConfig, type FactoryRun, type FactoryResult } from "./factory.util";

const resourceSchema = z.object({
  version: z.literal(1),
  image: z.string(),
  volumes: z.array(
    z.string().regex(/^kf-[a-f0-9-]{36}-(candidate|dependencies|socket|fetch-socket)$/)
  ),
  ready: z.boolean(),
  dependencyKey: z.string().optional(),
  exported: z.boolean().default(false)
});
export function resources(store: FactoryStore, id: string) {
  const file = store.file(`${id}.resources.json`);
  if (!existsSync(file)) return null;
  const state = resourceSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  if (
    state.volumes.some(
      (volume) =>
        ![
          candidateVolume(id),
          dependencyVolume(id),
          `kf-${id}-socket`,
          `kf-${id}-fetch-socket`
        ].includes(volume)
    )
  )
    throw new Error("Resource manifest contains another run's volume");
  return state;
}
export function candidateVolume(id: string): string {
  return `kf-${z.string().uuid().parse(id)}-candidate`;
}
export function dependencyVolume(id: string): string {
  return `kf-${z.string().uuid().parse(id)}-dependencies`;
}
function helper(
  config: FactoryConfig,
  id: string,
  volume: string,
  operation: string,
  input: z.infer<ReturnType<typeof z.json>>,
  transfer?: string
): string {
  return execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "--label",
      `kaine.factory.run=${id}`,
      "--network",
      "none",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "128",
      "--memory",
      "512m",
      "--mount",
      `type=volume,src=${volume},dst=/workspace`,
      ...(transfer ? ["--mount", `type=bind,src=${transfer},dst=/input,readonly`] : []),
      "-i",
      "--entrypoint",
      "node",
      config.image,
      "/opt/factory/factory-storage.mjs",
      operation
    ],
    {
      input: JSON.stringify(input),
      encoding: "utf8",
      maxBuffer: 96 * 1024 * 1024,
      timeout: 60000,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    }
  );
}
export function applyCandidate(
  config: FactoryConfig,
  run: FactoryRun,
  files: FactoryResult["files"]
): void {
  helper(config, run.id, candidateVolume(run.id), "apply", { files });
}
function removeSourceBundle(store: FactoryStore, id: string): void {
  const transfer = path.join(
    path.dirname(store.directory),
    "transfers",
    z.string().uuid().parse(id)
  );
  if (!existsSync(transfer)) return;
  const file = path.join(transfer, "source.bundle");
  if (existsSync(file)) unlinkSync(file);
  rmdirSync(transfer);
}
export function initializeCandidate(
  config: FactoryConfig,
  run: FactoryRun,
  store: FactoryStore,
  workspace: string,
  files: FactoryResult["files"],
  bundle = true
): void {
  const volumes = [candidateVolume(run.id), dependencyVolume(run.id)];
  store.write(`${run.id}.resources.json`, {
    version: 1,
    image: config.image,
    volumes: [...volumes, `kf-${run.id}-socket`, `kf-${run.id}-fetch-socket`],
    ready: false
  });
  for (const volume of volumes) {
    docker(["volume", "create", "--label", `kaine.factory.run=${run.id}`, volume]);
    docker([
      "run",
      "--rm",
      "--label",
      `kaine.factory.run=${run.id}`,
      "--network",
      "none",
      "--user",
      "0",
      "--mount",
      `type=volume,src=${volume},dst=/workspace`,
      "--entrypoint",
      "chown",
      config.image,
      "1000:1000",
      "/workspace"
    ]);
  }
  const transfer = path.join(path.dirname(store.directory), "transfers", run.id);
  mkdirSync(transfer, { recursive: true });
  let primary: { cause: unknown } | undefined;
  try {
    if (bundle) git(workspace, ["bundle", "create", path.join(transfer, "source.bundle"), "HEAD"]);
    helper(
      config,
      run.id,
      candidateVolume(run.id),
      "init",
      { bundle, revision: run.revision },
      bundle ? transfer : undefined
    );
    store.write(`${run.id}.resources.json`, {
      version: 1,
      image: config.image,
      volumes: [...volumes, `kf-${run.id}-socket`, `kf-${run.id}-fetch-socket`],
      ready: true
    });
    applyCandidate(config, run, files);
  } catch (error) {
    primary = { cause: error };
  }
  try {
    removeSourceBundle(store, run.id);
  } catch (error) {
    progress(store, run.id, "cleanup", "failed", "Source bundle cleanup failed");
    if (!primary) throw error;
  }
  if (primary) throw primary.cause;
}
export function applyDependencyMetadata(
  config: FactoryConfig,
  run: FactoryRun,
  files: FactoryResult["files"]
): void {
  helper(config, run.id, dependencyVolume(run.id), "apply", { files });
}
export function exportCandidateFile(
  config: FactoryConfig,
  run: FactoryRun,
  relative: string,
  destination: string
): void {
  const result = z
    .object({ content: z.string().max(90 * 1024 * 1024) })
    .parse(JSON.parse(helper(config, run.id, candidateVolume(run.id), "read", { path: relative })));
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, Buffer.from(result.content, "base64"));
}
export function readCandidateText(
  config: FactoryConfig,
  run: FactoryRun,
  relative: string
): string {
  const result = z
    .object({ content: z.string().max(90 * 1024 * 1024) })
    .parse(JSON.parse(helper(config, run.id, candidateVolume(run.id), "read", { path: relative })));
  return Buffer.from(result.content, "base64").toString("utf8");
}
export function finishStorage(
  config: FactoryConfig,
  run: FactoryRun,
  store: FactoryStore
): boolean {
  try {
    const state = resources(store, run.id);
    if (!state) {
      cancelContainers(run.id);
      removeSourceBundle(store, run.id);
      run.cleanup = { status: "passed", errors: [] };
      return true;
    }
    if (state.image !== config.image)
      throw new Error("Recovery requires the recorded worker image");
    progress(store, run.id, "cleanup", "started");
    cancelContainers(run.id);
    removeSourceBundle(store, run.id);
    if (state.ready && !state.exported) {
      const collected = z
        .object({
          files: z.array(z.string()).max(500),
          warnings: z.array(z.string().max(200)).max(3)
        })
        .parse(JSON.parse(helper(config, run.id, candidateVolume(run.id), "evidence", {})));
      const directory = path.join(path.dirname(store.directory), "artifacts", run.id);
      mkdirSync(directory, { recursive: true });
      for (const warning of collected.warnings)
        progress(store, run.id, "cleanup", "started", warning);
      for (const file of collected.files) {
        const target = safeDestination(directory, file);
        exportCandidateFile(config, run, file, target);
        registerArtifact(store, run.id, target);
      }
      state.exported = true;
      store.write(`${run.id}.resources.json`, z.json().parse(state));
    }
    for (const volume of state.volumes) {
      if (docker(["volume", "ls", "-q", "--filter", `name=^${volume}$`])) {
        const owner = docker([
          "volume",
          "inspect",
          "--format",
          '{{index .Labels "kaine.factory.run"}}',
          volume
        ]);
        if (owner !== run.id) throw new Error("Volume ownership differs");
        docker(["volume", "rm", volume]);
      }
      if (docker(["volume", "ls", "-q", "--filter", `name=^${volume}$`]))
        throw new Error("Volume remains");
    }
    run.cleanup = { status: "passed", errors: [] };
    progress(store, run.id, "cleanup", "passed");
    return true;
  } catch (error) {
    run.cleanup = {
      status: "cleanup-unverified",
      errors: [error instanceof Error ? error.message : "Storage cleanup failed"]
    };
    progress(store, run.id, "cleanup", "failed", run.cleanup.errors.join("; "));
    return false;
  }
}
