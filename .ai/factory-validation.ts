import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { parse } from "yaml";
import { z } from "zod";

import { commandEnvironment } from "./agent-run.util";
import { docker, withDependencyProxy } from "./factory-docker";
import { progress, registerArtifact, redact } from "./factory-progress";
import {
  candidateVolume,
  dependencyVolume,
  readCandidateText,
  applyDependencyMetadata,
  resources
} from "./factory-storage";
import type { FactoryStore } from "./factory-store";
import {
  fingerprint,
  validationCommands,
  type FactoryConfig,
  type FactoryRun
} from "./factory.util";
import { runModelProcess } from "./model-process.util";

export async function validationCommand(
  config: FactoryConfig,
  run: FactoryRun,
  store: FactoryStore,
  _workspace: string,
  command: string[],
  network = "none",
  dependencyStore?: string,
  proxySocket?: string
) {
  store.assertActive(run.id);
  const releaseResource = await store.resource("validation", run);
  const name = `kf-${run.id}-validation`;
  const artifact = `${run.id}.check-${run.validation.length}.log`;
  let output = "";
  let passed = false;
  let cleaned = false;
  let infrastructureFailure = false;
  writeFileSync(store.file(artifact), "");
  const artifactId = registerArtifact(store, run.id, store.file(artifact));
  const startedAt = new Date().toISOString();
  const phase = proxySocket
    ? "fetch"
    : command[1] === "install"
      ? "offline-install"
      : command[1] === "rebuild"
        ? "rebuild"
        : "validation";
  run.currentCommand = { command: command.join(" "), startedAt, lastOutputAt: null, artifactId };
  store.save(run);
  progress(store, run.id, phase, "started", command.join(" "), artifactId);
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let discardLine = false;
  let lastFlush = 0;
  const capture = (chunk: Buffer) => {
    pending += decoder.write(chunk);
    const boundary = Math.max(pending.lastIndexOf("\n"), pending.lastIndexOf("\r"));
    if (boundary >= 0) {
      if (!discardLine)
        output = (output + redact(pending.slice(0, boundary + 1))).slice(-4 * 1024 * 1024);
      pending = pending.slice(boundary + 1);
      discardLine = false;
    }
    if (pending.length > 65536) {
      pending = "";
      discardLine = true;
    }
    if (Date.now() - lastFlush >= 250) {
      writeFileSync(store.file(artifact), output);
      if (run.currentCommand) run.currentCommand.lastOutputAt = new Date().toISOString();
      store.save(run);
      lastFlush = Date.now();
    }
  };
  try {
    const execution = await runModelProcess({
      command: "docker",
      args: [
        "run",
        "--name",
        name,
        "--label",
        `kaine.factory.run=${run.id}`,
        "--init",
        "--network",
        network,
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "512",
        "--memory",
        "8g",
        "--cpus",
        "4",
        "--mount",
        `type=volume,src=${proxySocket ? dependencyVolume(run.id) : candidateVolume(run.id)},dst=/workspace`,
        ...(dependencyStore
          ? ["--mount", `type=volume,src=${dependencyVolume(run.id)},dst=/factory-dependencies`]
          : []),
        ...(proxySocket ? ["--mount", `type=volume,src=${proxySocket},dst=/socket,readonly`] : []),
        "--workdir",
        "/workspace",
        "--env",
        "CI=true",
        "--env",
        "GIT_CONFIG_COUNT=1",
        "--env",
        "GIT_CONFIG_KEY_0=safe.directory",
        "--env",
        "GIT_CONFIG_VALUE_0=/workspace",
        "--env",
        "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/factory",
        "--env",
        "ALLOW_LOCAL_DB_PUSH=true",
        "--env",
        "BETTER_AUTH_SECRET=factory-local-fixture-secret-000000000000",
        "--env",
        "PLAYWRIGHT_BROWSERS_PATH=/opt/playwright",
        "--entrypoint",
        command[0] ?? "false",
        config.image,
        ...command.slice(1)
      ],
      env: commandEnvironment(process.env),
      prompt: "",
      timeoutMs: 1800000,
      stdout: capture,
      stderr: capture
    });
    passed =
      execution.termination === "completed" &&
      execution.cleanup === "passed" &&
      !store.cancelled(run.id);
    infrastructureFailure =
      execution.exitCode === 125 || execution.exitCode === 126 || execution.exitCode === 127;
  } finally {
    try {
      const existing = docker(["ps", "-aq", "--filter", `name=^/${name}$`]);
      if (existing) docker(["rm", "-f", name]);
      cleaned = !docker(["ps", "-aq", "--filter", `name=^/${name}$`]);
    } catch {
      /* Save failed evidence even if Docker is unavailable. */
    }
    if (!cleaned) {
      passed = false;
      progress(store, run.id, "cleanup", "failed", "Validation cleanup could not be verified");
    }
    if (!discardLine) output = (output + redact(pending + decoder.end())).slice(-4 * 1024 * 1024);
    writeFileSync(store.file(artifact), output);
    progress(store, run.id, phase, passed ? "passed" : "failed", command.join(" "), artifactId);
    run.validation.push({
      command: command.join(" "),
      passed,
      artifact,
      startedAt,
      finishedAt: new Date().toISOString()
    });
    run.currentCommand = null;
    store.save(run);
    releaseResource();
  }
  if (!cleaned)
    throw new Error(
      `Validation command ${command.join(" ")} did not complete safely; cleanup could not be verified; inspect ${artifact}`
    );
  if (infrastructureFailure)
    throw new Error(`Validation infrastructure failed; inspect ${artifact}`);
  return passed;
}

export async function validateWorkspace(
  config: FactoryConfig,
  run: FactoryRun,
  store: FactoryStore,
  workspace: string,
  tier: string,
  files: string[]
): Promise<boolean> {
  // The network container never sees candidate source or package-manager config.
  const lock = readCandidateText(config, run, "pnpm-lock.yaml");
  const metadata = z
    .object({
      patchedDependencies: z.record(z.string(), z.object({ path: z.string() })).optional()
    })
    .parse(parse(lock));
  const inputs = [
    { path: "pnpm-lock.yaml", content: lock },
    {
      path: "package.json",
      content: JSON.stringify({ private: true, packageManager: "pnpm@10.29.3" })
    }
  ];
  for (const patch of Object.values(metadata.patchedDependencies ?? {})) {
    if (!/^patches\/[^/]+\.patch$/.test(patch.path))
      throw new Error("Unsupported dependency patch path");
    inputs.push({ path: patch.path, content: readCandidateText(config, run, patch.path) });
  }
  const state = resources(store, run.id);
  if (!state?.ready) throw new Error("Candidate storage is not ready");
  const key = fingerprint(JSON.stringify(inputs));
  if (state.dependencyKey !== key) {
    applyDependencyMetadata(config, run, inputs);
    if (
      !(await withDependencyProxy(config, run.id, async (socket) =>
        validationCommand(
          config,
          run,
          store,
          workspace,
          ["node", "/opt/factory/factory-fetch.mjs"],
          "none",
          undefined,
          socket
        )
      ))
    )
      throw new Error("Dependency fetch failed; inspect the recorded check log before retrying");
    state.dependencyKey = key;
    store.write(`${run.id}.resources.json`, z.json().parse(state));
  }
  if (
    !(await validationCommand(
      config,
      run,
      store,
      workspace,
      [
        "pnpm",
        "install",
        "--offline",
        "--frozen-lockfile",
        "--ignore-scripts",
        "--store-dir",
        "/factory-dependencies/store"
      ],
      "none",
      dependencyVolume(run.id)
    ))
  )
    throw new Error(
      "Offline dependency install failed; inspect the recorded check log before retrying"
    );
  for (const command of [
    ["pnpm", "rebuild", "--recursive"],
    ["pnpm", "run", "prepare"]
  ])
    if (!(await validationCommand(config, run, store, workspace, command))) return false;
  const commands = validationCommands(tier, files);
  const database = `kf-${run.id}-postgres`;
  const web = commands.some((command) => command.includes("playwright"));
  try {
    if (web) {
      store.assertActive(run.id);
      docker([
        "run",
        "-d",
        "--name",
        database,
        "--label",
        `kaine.factory.run=${run.id}`,
        "--network",
        "none",
        "--memory",
        "512m",
        "--env",
        "POSTGRES_PASSWORD=postgres",
        "--env",
        "POSTGRES_DB=factory",
        "--tmpfs",
        "/var/lib/postgresql/data",
        "postgres:17"
      ]);
      docker([
        "exec",
        database,
        "sh",
        "-c",
        "for attempt in $(seq 1 30); do pg_isready -U postgres -d factory && exit 0; sleep 1; done; exit 1"
      ]);
    }
    const network = web ? `container:${database}` : "none";
    for (const command of commands)
      if (!(await validationCommand(config, run, store, workspace, command, network))) return false;
    return true;
  } finally {
    if (web && docker(["ps", "-aq", "--filter", `name=^/${database}$`]))
      docker(["rm", "-f", database]);
  }
}

export function validationFeedback(run: FactoryRun, store: FactoryStore): string {
  return run.validation
    .filter((check) => !check.passed)
    .map(
      (check) =>
        `${check.command}\n${readFileSync(store.file(check.artifact), "utf8").slice(-20000)}`
    )
    .join("\n");
}

export function prepareEvidence(workspace: string): void {
  const dir = path.join(workspace, ".ai.local");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "factory-playwright.config.ts"),
    'import config from "../apps/e2e/playwright.config";\nexport default { ...config, testDir: "../apps/e2e/tests", use: { ...config.use, trace: "on", video: "on", screenshot: "on" } };\n'
  );
}
