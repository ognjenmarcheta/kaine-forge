import { execFileSync } from "node:child_process";
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
  requireIsolation,
  sandboxConfig
} from "./agent-run.util";
import { runModelProcess } from "./model-process.util";
import { runNativeProbe } from "./native-sandbox";
import { fingerprintInstructions } from "./run-fingerprint.util";
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
    schemaVersion: 2,
    harness: options.harness,
    caseId: options.case,
    reasoning: options.reasoning,
    mode: options.mode,
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
    cleanup: "not-started",
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
    const probeSource = readFileSync(path.join(import.meta.dirname, "sandbox-probe.mjs"), "utf8");
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
        (relative === ".ai/sandbox-probe.mjs"
          ? probeSource.replaceAll("\r\n", "\n")
          : readFileSync(path.resolve(import.meta.dirname, "..", relative), "utf8").replaceAll(
              "\r\n",
              "\n"
            ))
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
    run.effectiveConfig = config
      .filter((item) => item !== "-c")
      .map((item) =>
        item
          .replaceAll(temporary.replaceAll("\\", "/"), "<temporary>")
          .replaceAll(outside.replaceAll("\\", "/"), "<outside>")
          .replaceAll(profileName, "<profile>")
      );
    run.configurationHash = createHash("sha256")
      .update(JSON.stringify(run.effectiveConfig))
      .digest("hex");
    run.instructionHash = fingerprintInstructions(workspace);
    const toolsHash = createHash("sha256").update(
      JSON.stringify({ cliVersion, mcp: false, browser: false, plugins: false })
    );
    for (const file of [
      ".ai/native-sandbox.ts",
      ".ai/process-cleanup.util.ts",
      ".ai/permissions.json",
      ".ai/hooks/pre-tool-use.mjs",
      ".ai/hooks/guarded-command.mjs"
    ])
      toolsHash
        .update(file)
        .update(
          readFileSync(path.resolve(import.meta.dirname, "..", file), "utf8").replaceAll(
            "\r\n",
            "\n"
          )
        );
    run.toolHash = toolsHash.update(probeSource).digest("hex");
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
      const modes = options["probe-only"] ? [options.mode] : (["read", "edit"] as const);
      for (const mode of modes) {
        const probeConfig = sandboxConfig({
          profileName,
          temporary,
          outside,
          mode,
          nodeDirectory: path.dirname(process.execPath),
          commandEnv: commandEnvironment(process.env)
        });
        const stdout = await runNativeProbe({
          config: probeConfig,
          onConfiguration: (observed) => {
            run.observedConfig = { ...run.observedConfig, [mode]: observed };
            save();
          },
          workspace,
          profileName,
          command: [
            process.execPath,
            "--input-type=module",
            "--eval",
            probeSource,
            "--",
            "kaine-boundary-probe",
            readable,
            `${readable}.write`,
            protectedFile,
            path.join(outside, "write"),
            String(address.port),
            mode,
            environmentFile,
            gitFile
          ]
        });
        const probes = probeResultSchema.safeParse(JSON.parse(stdout.trim()));
        const observation = z
          .object({ networkEvidence: z.enum(["denied", "allowed", "inconclusive"]) })
          .passthrough()
          .parse(JSON.parse(stdout.trim()));
        const { networkEvidence, ...checks } = observation;
        run.networkEvidence = networkEvidence;
        run.boundaryChecks = z.record(z.string(), z.boolean()).parse(checks);
        run.isolation = { ...run.isolation, [mode]: { ...run.boundaryChecks, networkEvidence } };
        save();
        if (!probes.success)
          throw new Error(
            `Sandbox ${mode} enforcement failed: ${probes.error.issues.map((issue) => issue.path.join(".")).join(", ")}`
          );
      }
      if (!options["probe-only"]) requireIsolation(run.isolation ?? {});
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
    run.termination = "failed";
    const execution = await runModelProcess({
      command: "codex",
      args: [
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
        ...(options.reasoning ? ["-c", `model_reasoning_effort="${options.reasoning}"`] : []),
        "-"
      ],
      env: controllerEnvironment(process.env, true),
      prompt,
      timeoutMs: options.timeout * 1000,
      stdout: (chunk) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) consume(line);
      },
      // Raw stderr is local and opt-in, like the JSONL transcript.
      stderr: (chunk) => {
        if (run.transcript) appendFileSync(`${run.transcript}.stderr`, chunk);
      }
    });
    Object.assign(run, execution);
    run.termination = execution.termination;
    if (buffer.trim()) consume(buffer);
    if (run.termination === "completed" && (!completedEvent || failedEvent))
      run.termination = "failed";
    save();
    return { path: reportPath, run };
  } catch (error) {
    if (run.termination === "completed") run.termination = "failed";
    run.failure = [
      run.failure,
      error instanceof Error ? error.message.split("\n")[0] : "Execution failed"
    ]
      .filter(Boolean)
      .join("; ");
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
