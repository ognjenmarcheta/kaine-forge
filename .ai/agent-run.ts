import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  statSync,
  rmSync,
  writeFileSync
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import {
  assertSupportedSandbox,
  commandEnvironment,
  controllerEnvironment,
  parseAgentRunOptions,
  probeResultSchema,
  projectConfigRestrictions,
  sandboxConfig
} from "./agent-run.util";
import { runNativeProbe } from "./native-sandbox";
import { codingRunSchema, usageSchema, type CodingRun } from "./run-report.util";

const eventSchema = z.object({
  type: z.string(),
  usage: usageSchema.optional(),
  item: z
    .object({
      type: z.string(),
      status: z.string().optional(),
      exit_code: z.number().int().nullable().optional()
    })
    .passthrough()
    .optional()
});

export async function runCodingAgent(args: string[]): Promise<{ path: string; run: CodingRun }> {
  const options = parseAgentRunOptions(args);
  const workspace = realpathSync(options.workspace);
  const runId = randomUUID();
  const output = path.resolve(import.meta.dirname, "../.ai.local/agent-runs");
  mkdirSync(output, { recursive: true });
  const reportPath = path.join(output, `${runId}.json`);
  const cliVersion = execFileSync("codex", ["--version"], { encoding: "utf8" }).trim();
  const run: CodingRun = {
    schemaVersion: 1,
    runId,
    workspace,
    revision: execFileSync("git", ["-C", workspace, "rev-parse", "HEAD"], {
      encoding: "utf8"
    }).trim(),
    model: options.model ?? "probe-only",
    cliVersion,
    configurationHash: "",
    startedAt: new Date().toISOString(),
    durationMs: 0,
    exitCode: null,
    termination: "preflight-failed",
    commands: [],
    transcript: null,
    outcome: null,
    reviewMinutes: null,
    note: null
  };
  const startedAt = Date.now();
  const save = () => {
    run.durationMs = Date.now() - startedAt;
    writeFileSync(reportPath, `${JSON.stringify(codingRunSchema.parse(run), null, 2)}\n`);
  };
  save();
  const markers: string[] = [];
  try {
    assertSupportedSandbox(process.platform, cliVersion);
    projectConfigRestrictions(workspace);
    for (const relative of [
      ".ai/permissions.json",
      ".ai/hooks/pre-tool-use.mjs",
      ".ai/hooks/guarded-command.mjs",
      ".ai/hooks/session-start.mjs",
      ".ai/sandbox-probe.mjs"
    ]) {
      if (
        readFileSync(path.join(workspace, relative), "utf8").replaceAll("\r\n", "\n") !==
        readFileSync(path.resolve(import.meta.dirname, "..", relative), "utf8").replaceAll(
          "\r\n",
          "\n"
        )
      )
        throw new Error(`Untrusted runner dependency: ${relative}`);
    }
    if (!existsSync(path.join(workspace, ".codex", "config.toml")))
      throw new Error("Run pnpm ai:install --agent codex before using this runner");
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), "kaine-sandbox-"));
    const temporary = path.join(temporaryRoot, "allowed");
    const outside = path.join(temporaryRoot, "outside");
    mkdirSync(temporary);
    mkdirSync(outside);
    const protectedRoot = path.join(workspace, ".ai.local", "sandbox-probes", runId);
    mkdirSync(protectedRoot, { recursive: true });
    const readable = path.join(workspace, `.kaine-probe-${runId}`);
    markers.push(readable, `${readable}.write`);
    const protectedFile = path.join(protectedRoot, "protected");
    const environmentFile = path.join(workspace, `.env.kaine-probe-${runId}`);
    markers.push(environmentFile);
    writeFileSync(readable, "kaine-sandbox-control");
    writeFileSync(protectedFile, "synthetic-protected-value");
    writeFileSync(environmentFile, "synthetic-environment-value");
    writeFileSync(path.join(outside, "write"), "synthetic-outside-value");
    const gitRoot = path.join(workspace, ".git");
    const gitFile = statSync(gitRoot).isDirectory() ? path.join(gitRoot, "HEAD") : gitRoot;
    const profileName = `kaine_${runId.replaceAll("-", "")}`;
    const config = sandboxConfig({
      profileName,
      temporary,
      outside,
      mode: options.mode,
      nodeDirectory: path.dirname(process.execPath),
      commandEnv: commandEnvironment(process.env)
    });
    run.configurationHash = createHash("sha256").update(JSON.stringify(config)).digest("hex");
    save();
    const listener = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve, reject) => {
      listener.once("error", reject);
      listener.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = listener.address();
      if (!address || typeof address === "string") throw new Error("Missing probe listener");
      // A reachable host listener is the positive control for the sandbox's network denial.
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect({ port: address.port, host: "127.0.0.1" });
        socket.once("connect", () => {
          socket.destroy();
          resolve();
        });
        socket.once("error", reject);
      });
      const probeScript = path.join(workspace, ".ai", "sandbox-probe.mjs");
      if (!existsSync(probeScript))
        throw new Error("Workspace must contain the Kaine sandbox probe");
      const stdout = await runNativeProbe({
        config,
        workspace,
        profileName,
        command: [
          process.execPath,
          probeScript,
          readable,
          `${readable}.write`,
          protectedFile,
          path.join(outside, "write"),
          String(address.port),
          options.mode,
          environmentFile,
          gitFile
        ]
      });
      const probes = probeResultSchema.safeParse(JSON.parse(stdout.trim()));
      run.boundaryChecks = z.record(z.string(), z.boolean()).parse(JSON.parse(stdout.trim()));
      save();
      if (!probes.success)
        throw new Error(
          `Sandbox enforcement failed: ${probes.error.issues.map((issue) => issue.path.join(".")).join(", ")}`
        );
    } finally {
      listener.close();
    }
    if (options["probe-only"]) {
      run.termination = "completed";
      run.exitCode = 0;
      save();
      return { path: reportPath, run };
    }
    const prompt = readFileSync(options["prompt-file"] ?? "", "utf8");
    if (options["save-transcript"]) run.transcript = path.join(output, `${runId}.jsonl`);
    let buffer = "";
    let failedEvent = false;
    let completedEvent = false;
    const consume = (line: string) => {
      if (run.transcript) appendFileSync(run.transcript, `${line}\n`);
      try {
        const parsed = eventSchema.safeParse(JSON.parse(line));
        if (!parsed.success) return;
        const event = parsed.data;
        if (event.type === "turn.failed" || event.type === "error") failedEvent = true;
        if (event.type === "turn.completed") completedEvent = true;
        if (event.usage) run.usage = event.usage;
        if (event.type === "item.completed" && event.item?.type === "command_execution")
          run.commands.push({
            status: event.item.status ?? "unknown",
            exitCode: event.item.exit_code ?? null
          });
      } catch {
        /* Non-JSON startup lines do not count as agent evidence. */
      }
    };
    const child = spawn(
      "codex",
      [
        "exec",
        "--ignore-user-config",
        "--strict-config",
        "--dangerously-bypass-hook-trust",
        "--ephemeral",
        "--json",
        "--cd",
        workspace,
        "--model",
        options.model ?? "",
        ...config,
        "-"
      ],
      { env: controllerEnvironment(process.env, true), stdio: ["pipe", "pipe", "pipe"] }
    );
    run.termination = "failed";
    const stop = () => {
      if (child.pid)
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true
        });
    };
    const timer = setTimeout(() => {
      run.termination = "timeout";
      stop();
    }, options.timeout * 1000);
    const cancel = () => {
      run.termination = "cancelled";
      stop();
    };
    process.once("SIGINT", cancel);
    process.once("SIGTERM", cancel);
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) consume(line);
    });
    // Raw stderr is local and opt-in, like the JSONL transcript.
    child.stderr.on("data", (chunk: Buffer) => {
      if (run.transcript) appendFileSync(`${run.transcript}.stderr`, chunk);
    });
    child.stdin.end(prompt);
    try {
      run.exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
      if (buffer.trim()) consume(buffer);
      if (!["timeout", "cancelled"].includes(run.termination))
        run.termination =
          run.exitCode === 0 && completedEvent && !failedEvent ? "completed" : "failed";
    } finally {
      clearTimeout(timer);
      process.removeListener("SIGINT", cancel);
      process.removeListener("SIGTERM", cancel);
    }
    save();
    return { path: reportPath, run };
  } catch (error) {
    save();
    throw error;
  } finally {
    for (const marker of markers) rmSync(marker, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCodingAgent(process.argv.slice(2).filter((arg) => arg !== "--"))
    .then((result) => {
      console.log(
        `Run: ${result.path}\nTermination: ${result.run.termination}; task success requires independent review.`
      );
      process.exitCode = result.run.termination === "completed" ? 0 : 1;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message.split("\n")[0] : "Sandbox run failed");
      process.exitCode = 1;
    });
}
