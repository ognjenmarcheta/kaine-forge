import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";

import { commandEnvironment } from "./agent-run.util";
import { REPO_ROOT } from "./ai.util";
import type { FactoryStore } from "./factory-store";
import {
  factoryResultSchema,
  fingerprint,
  type FactoryConfig,
  type FactoryProvider,
  type FactoryRun
} from "./factory.util";
import { runModelProcess } from "./model-process.util";
import { codingRunSchema, type CodingRun } from "./run-report.util";

export function docker(args: string[]): string {
  try {
    return execFileSync("docker", args, {
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    throw new Error(`Docker command failed: ${args.slice(0, 2).join(" ")}`);
  }
}

export function authVolume(repository: string, provider: FactoryProvider): string {
  return `kaine-factory-${fingerprint(repository).slice(0, 12)}-${provider}-auth`;
}

export function workerArguments(
  image: string,
  id: string,
  socket: string,
  auth: string,
  provider: FactoryProvider,
  operation: string
): string[] {
  return [
    "run",
    "--name",
    `kf-${id}-worker`,
    "--label",
    `kaine.factory.run=${id}`,
    "--init",
    "--read-only",
    "--network",
    "none",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "256",
    "--memory",
    "2g",
    "--cpus",
    "2",
    "--tmpfs",
    "/tmp:rw,exec,nosuid,size=512m,mode=1777",
    "--mount",
    `type=volume,src=${socket},dst=/socket,readonly`,
    "--mount",
    `type=volume,src=${auth},dst=/auth${operation === "probe" ? ",readonly" : ""}`,
    "-i",
    ...(operation === "login" ? ["-t"] : []),
    image,
    provider,
    operation
  ];
}

function removeContainer(name: string): void {
  try {
    docker(["rm", "-f", name]);
  } catch {
    /* A concurrent cancel may already be removing the same container. */
  }
  const filter = /^[a-f0-9]{12,64}$/.test(name) ? `id=${name}` : `name=^/${name}$`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!docker(["ps", "-aq", "--filter", filter])) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  throw new Error("Container cleanup could not be verified");
}

export function cancelContainers(id: string): void {
  z.string().uuid().parse(id);
  const ids = docker(["ps", "-aq", "--filter", `label=kaine.factory.run=${id}`])
    .split(/\r?\n/)
    .filter(Boolean);
  for (const container of ids) removeContainer(container);
  if (docker(["ps", "-aq", "--filter", `label=kaine.factory.run=${id}`]))
    throw new Error("Run cleanup failed");
}

export async function withDependencyProxy<T>(
  config: FactoryConfig,
  id: string,
  action: (socket: string) => Promise<T>
): Promise<T> {
  const socket = `kf-${id}-fetch-socket`;
  const proxy = `kf-${id}-fetch-proxy`;
  docker(["volume", "create", socket]);
  try {
    docker([
      "run",
      "-d",
      "--name",
      proxy,
      "--label",
      `kaine.factory.run=${id}`,
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "32",
      "--memory",
      "128m",
      "--user",
      "0",
      "--mount",
      `type=volume,src=${socket},dst=/socket`,
      "--entrypoint",
      "node",
      config.image,
      "/opt/factory/factory-proxy.mjs",
      "dependencies"
    ]);
    docker([
      "exec",
      proxy,
      "node",
      "-e",
      "const fs=require('fs');let n=0;const t=setInterval(()=>{if(fs.existsSync('/socket/provider.sock')){clearInterval(t);process.exit(0)}if(++n===50)process.exit(1)},100)"
    ]);
    return await action(socket);
  } finally {
    removeContainer(proxy);
    docker(["volume", "rm", socket]);
  }
}

async function withWorker<T>(
  config: FactoryConfig,
  provider: FactoryProvider,
  id: string,
  operation: string,
  action: (args: string[]) => Promise<T>
): Promise<T> {
  const socket = `kf-${id}-socket`;
  const proxy = `kf-${id}-proxy`;
  const auth = authVolume(config.repository, provider);
  docker(["volume", "create", socket]);
  docker(["volume", "create", auth]);
  try {
    docker([
      "run",
      "--rm",
      "--network",
      "none",
      "--user",
      "0",
      "--entrypoint",
      "chown",
      "--mount",
      `type=volume,src=${auth},dst=/auth`,
      config.image,
      "1000:1000",
      "/auth"
    ]);
    docker([
      "run",
      "-d",
      "--name",
      proxy,
      "--label",
      `kaine.factory.run=${id}`,
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "32",
      "--memory",
      "128m",
      "--user",
      "0",
      "--mount",
      `type=volume,src=${socket},dst=/socket`,
      "--entrypoint",
      "node",
      config.image,
      "/opt/factory/factory-proxy.mjs"
    ]);
    // Socket readiness is checked without making a provider request.
    docker([
      "exec",
      proxy,
      "node",
      "-e",
      "const fs=require('fs');let n=0;const t=setInterval(()=>{if(fs.existsSync('/socket/provider.sock')){clearInterval(t);process.exit(0)}if(++n===50)process.exit(1)},100)"
    ]);
    return await action(workerArguments(config.image, id, socket, auth, provider, operation));
  } finally {
    cancelContainers(id);
    docker(["volume", "rm", socket]);
  }
}

export async function login(
  config: FactoryConfig,
  provider: FactoryProvider,
  id: string = randomUUID()
): Promise<void> {
  await withWorker(config, provider, id, "login", async (args) => {
    const result = spawnSync("docker", args, { stdio: "inherit", windowsHide: true });
    if (result.status !== 0) throw new Error("Subscription login did not complete");
  });
}

export function importSubscription(config: FactoryConfig, provider: FactoryProvider): void {
  const filename = provider === "codex" ? "auth.json" : ".credentials.json";
  const source = path.join(homedir(), provider === "codex" ? ".codex" : ".claude", filename);
  copySubscription(config, provider, source);
}

function copySubscription(config: FactoryConfig, provider: FactoryProvider, source: string): void {
  const filename = provider === "codex" ? "auth.json" : ".credentials.json";
  const credential = JSON.parse(readFileSync(source, "utf8"));
  if (provider === "codex") z.object({ auth_mode: z.literal("chatgpt") }).parse(credential);
  else z.object({ claudeAiOauth: z.object({ accessToken: z.string().min(1) }) }).parse(credential);
  const volume = authVolume(config.repository, provider);
  const container = `kf-import-${randomUUID()}`;
  docker(["volume", "create", volume]);
  docker([
    "create",
    "--name",
    container,
    "--network",
    "none",
    "--user",
    "0",
    "--mount",
    `type=volume,src=${volume},dst=/auth`,
    "--entrypoint",
    "node",
    config.image,
    "-e",
    `const fs=require('fs');fs.chownSync('/auth',1000,1000);fs.chownSync('/auth/${filename}',1000,1000);fs.chmodSync('/auth/${filename}',0o600)`
  ]);
  try {
    docker(["cp", source, `${container}:/auth/${filename}`]);
    docker(["start", "-a", container]);
  } finally {
    removeContainer(container);
  }
}

const probeSchema = z.object({
  isolation: z.literal(true),
  authenticated: z.boolean(),
  version: z.string()
});
export async function probeWorker(
  config: FactoryConfig,
  provider: FactoryProvider,
  id: string = randomUUID()
) {
  const scripts = [
    "factory-worker.mjs",
    "factory-proxy.mjs",
    "factory-provider.mjs",
    "factory-fetch.mjs"
  ];
  const hashes = JSON.parse(
    docker([
      "run",
      "--rm",
      "--read-only",
      "--network",
      "none",
      "--cap-drop",
      "ALL",
      "--entrypoint",
      "node",
      config.image,
      "-e",
      `const fs=require('fs'),c=require('crypto');console.log(JSON.stringify(${JSON.stringify(scripts)}.map(f=>c.createHash('sha256').update(fs.readFileSync('/opt/factory/'+f)).digest('hex'))))`
    ])
  );
  if (
    JSON.stringify(hashes) !==
    JSON.stringify(
      scripts.map((file) =>
        fingerprint(readFileSync(path.join(REPO_ROOT, ".ai", "docker", file), "utf8"))
      )
    )
  )
    throw new Error(
      "Worker image differs from canonical policy; rebuild and update the configured image ID"
    );
  return withWorker(config, provider, id, "probe", async (args) => {
    const result = spawnSync("docker", args, {
      encoding: "utf8",
      timeout: 30000,
      windowsHide: true
    });
    const parsed = probeSchema.safeParse(JSON.parse(result.stdout || "null"));
    if (!parsed.success) throw new Error(`${provider} worker isolation probe failed`);
    if (result.error || (result.status !== 0 && result.status !== 2))
      throw new Error("Worker probe did not stop cleanly");
    return parsed.data;
  });
}

export async function propose(
  config: FactoryConfig,
  run: FactoryRun,
  store: FactoryStore,
  prompt: string,
  provider = run.provider,
  model = run.model
) {
  store.assertActive(run.id);
  const readiness = await probeWorker(config, provider, run.id);
  if (!readiness.authenticated) throw new Error(`${provider} requires factory subscription login`);
  store.assertActive(run.id);
  const started = Date.now();
  let cleaned = false;
  let report: CodingRun | undefined;
  try {
    return await withWorker(config, provider, run.id, "propose", async (args) => {
      store.assertActive(run.id);
      let output = "";
      const execution = await runModelProcess({
        command: "docker",
        args,
        env: commandEnvironment(process.env),
        prompt: JSON.stringify({
          model,
          schema: z.toJSONSchema(factoryResultSchema, {
            target: provider === "claude" ? "draft-7" : "draft-2020-12"
          }),
          prompt
        }),
        timeoutMs: 1800000,
        stdout: (chunk) => {
          output += chunk.toString();
          if (output.length > 8 * 1024 * 1024) throw new Error("Worker output exceeds limit");
        },
        stderr: () => {}
      });
      let parsed: z.infer<ReturnType<typeof z.json>> = null;
      try {
        parsed = z.json().parse(JSON.parse(output || "null"));
      } catch {
        /* Rejected below; retain the execution record. */
      }
      const response = z
        .object({
          result: factoryResultSchema,
          version: z.string(),
          usage: z.record(z.string(), z.json())
        })
        .safeParse(execution.termination === "completed" ? parsed : null);
      const usage: Record<string, number> = {};
      if (response.success)
        for (const [key, value] of Object.entries(response.data.usage))
          if (typeof value === "number") usage[key] = value;
      run.invocations.push({
        provider,
        model,
        cliVersion: readiness.version,
        durationMs: Date.now() - started,
        exitCode: execution.exitCode,
        cleanup: false,
        usage
      });
      report = codingRunSchema.parse({
        schemaVersion: 2,
        harness: provider,
        caseId: `factory:${run.stage}:${run.issue}`,
        reasoning: "high",
        mode: "read",
        runId: randomUUID(),
        workspace: store.directory,
        revision: run.revision,
        model,
        cliVersion: readiness.version,
        configurationHash: fingerprint(
          JSON.stringify({ image: config.image, provider, model, effort: "high" })
        ),
        instructionHash: fingerprint(prompt),
        toolHash: fingerprint("proposal-only:no-tools"),
        networkEvidence: "denied",
        startedAt: new Date(started).toISOString(),
        durationMs: Date.now() - started,
        exitCode: execution.exitCode,
        termination: store.cancelled(run.id)
          ? "cancelled"
          : execution.termination === "completed" && !response.success
            ? "failed"
            : execution.termination,
        cleanup: "failed",
        usage,
        commands: [],
        transcript: null,
        outcome: null,
        reviewMinutes: null,
        note: `Factory run ${run.id}. Execution result only; human acceptance is not yet recorded.`
      });
      store.save(run);
      const failure = z
        .object({
          error: z.enum([
            "workspace-routing-unauthorized",
            "authentication-expired",
            "api-key-rejected",
            "authentication-invalid",
            "authentication-scope",
            "login-required",
            "authentication",
            "network",
            "model-unavailable",
            "rate-limit",
            "provider-error"
          ]),
          message: z.string().max(300).optional()
        })
        .safeParse(parsed);
      if (!response.success || execution.cleanup !== "passed" || store.cancelled(run.id))
        throw new Error(
          failure.success
            ? `${provider}: ${failure.data.error}${failure.data.message ? ` (${failure.data.message})` : ""}`
            : "Worker failed, was cancelled, or returned malformed results"
        );
      writeFileSync(
        store.file(`${run.id}.result-${run.invocations.length}.json`),
        `${JSON.stringify(response.data.result, null, 2)}\n`
      );
      return response.data.result;
    });
  } finally {
    // Verify cleanup on failed invocations too, without replacing the provider failure.
    cleaned = !docker(["ps", "-aq", "--filter", `label=kaine.factory.run=${run.id}`]);
    const invocation = run.invocations.at(-1);
    if (invocation) invocation.cleanup = cleaned;
    store.save(run);
    if (report) {
      report.cleanup = cleaned ? "passed" : "failed";
      const reports = path.join(store.directory, "..", "reports");
      mkdirSync(reports, { recursive: true });
      writeFileSync(
        path.join(reports, `${report.runId}.json`),
        `${JSON.stringify(report, null, 2)}\n`,
        { mode: 0o600 }
      );
    }
  }
}
