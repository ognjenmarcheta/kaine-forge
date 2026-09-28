import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

import { commandEnvironment } from "./agent-run.util";
import { docker } from "./factory-docker";
import type { FactoryStore } from "./factory-store";
import { safeDestination } from "./factory-workspace";
import { validationCommands, type FactoryConfig, type FactoryRun } from "./factory.util";
import { runModelProcess } from "./model-process.util";

export async function validationCommand(
  config: FactoryConfig,
  run: FactoryRun,
  store: FactoryStore,
  workspace: string,
  command: string[],
  network = "none",
  dependencyStore?: string
) {
  store.assertActive(run.id);
  const name = `kf-${run.id}-validation`;
  const artifact = `${run.id}.check-${run.validation.length}.log`;
  let output = "";
  let passed = false;
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
        `type=bind,src=${workspace},dst=/workspace`,
        ...(dependencyStore
          ? ["--mount", `type=bind,src=${dependencyStore},dst=/factory-store`]
          : []),
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
      stdout: (chunk) => {
        if (output.length < 4 * 1024 * 1024) output += chunk.toString();
      },
      stderr: (chunk) => {
        if (output.length < 4 * 1024 * 1024) output += chunk.toString();
      }
    });
    passed =
      execution.termination === "completed" &&
      execution.cleanup === "passed" &&
      !store.cancelled(run.id);
  } finally {
    const existing = docker(["ps", "-aq", "--filter", `name=^/${name}$`]);
    if (existing) docker(["rm", "-f", name]);
    if (docker(["ps", "-aq", "--filter", `name=^/${name}$`])) passed = false;
    writeFileSync(store.file(artifact), output);
    run.validation.push({ command: command.join(" "), passed, artifact });
    store.save(run);
  }
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
  const download = prepareDependencyDownload(workspace, store.directory);
  if (
    !(await validationCommand(
      config,
      run,
      store,
      download,
      ["pnpm", "fetch", "--ignore-scripts", "--ignore-pnpmfile", "--store-dir", "/workspace/store"],
      "bridge"
    ))
  )
    return false;
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
        "/factory-store"
      ],
      "none",
      path.join(download, "store")
    ))
  )
    return false;
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

export function prepareDependencyDownload(workspace: string, directory: string): string {
  const lock = readFileSync(safeDestination(workspace, "pnpm-lock.yaml"), "utf8");
  const metadata = z
    .object({
      patchedDependencies: z.record(z.string(), z.object({ path: z.string() })).optional()
    })
    .parse(parse(lock));
  const download = mkdtempSync(path.join(directory, "download-"));
  writeFileSync(path.join(download, "pnpm-lock.yaml"), lock);
  writeFileSync(
    path.join(download, "package.json"),
    JSON.stringify({ private: true, packageManager: "pnpm@10.29.3" })
  );
  mkdirSync(path.join(download, "store"));
  for (const patch of Object.values(metadata.patchedDependencies ?? {})) {
    if (!/^patches\/[^/]+\.patch$/.test(patch.path))
      throw new Error("Unsupported dependency patch path");
    const content = readFileSync(safeDestination(workspace, patch.path));
    const target = path.join(download, patch.path);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return download;
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
