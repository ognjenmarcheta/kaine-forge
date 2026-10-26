import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { controllerEnvironment } from "./agent-run.util";
import { type McpServer, type McpSource } from "./ai.util";
import { stopProcessTree, type CleanupStatus } from "./process-cleanup.util";

/** A `uvx --from` source pinned to a Git commit or an exact PyPI release. */
export const isPinnedUvxSource = (source: string | undefined): source is string =>
  source !== undefined &&
  (/^git\+\S+@[a-f0-9]{40}$/.test(source) || /^[A-Za-z0-9][\w.-]*==\d+\.\d+\.\d+$/.test(source));

export function validateMcpPins(source: McpSource): string[] {
  const problems: string[] = [];
  for (const [name, server] of Object.entries(source.mcpServers)) {
    // A remote server runs no local package, so it has no version to pin.
    if (server.url) continue;
    if (server.command === "npx") {
      const args = server.args ?? [];
      const specifierAt = args.findIndex((arg) => !arg.startsWith("-"));
      const specifier = args[specifierAt];
      if (!specifier || !/@\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(specifier))
        problems.push(`${name}: pin the npm package to an exact version`);
      // From the repo root, npx scans the pnpm node_modules tree first: seconds warm, past the
      // agents' 30 s start-up limit cold. `.ai` has no node_modules, so the scan is instant.
      // npx hands options after the package to the server, so the prefix must come first.
      if (!args.slice(0, specifierAt < 0 ? args.length : specifierAt).includes("--prefix=.ai"))
        problems.push(`${name}: start npx with --prefix=.ai to skip the workspace scan`);
    }
    if (server.command === "uvx") {
      const args = server.args ?? [];
      const from = args.indexOf("--from");
      if (from >= 0 && !isPinnedUvxSource(args[from + 1]))
        problems.push(`${name}: pin the uvx source to a commit or an exact version`);
    }
    for (const arg of server.args ?? []) {
      if (arg.startsWith("git+") && !/@[a-f0-9]{40}$/.test(arg))
        problems.push(`${name}: pin the Git dependency to a commit`);
    }
  }
  return problems;
}

/** Generated hook definitions are repository-owned; personal hooks are not inspected. */
export function validateHookPins(definitions: string[]): string[] {
  const problems: string[] = [];
  for (const definition of definitions) {
    for (const match of definition.matchAll(/git\+[^\s"'\\]+/g))
      if (!/@[a-f0-9]{40}$/.test(match[0]))
        problems.push("Hook: pin the Git dependency to a commit");
    for (const match of definition.matchAll(/\bnpx\s+(?:-y\s+|--yes\s+)?([^\s"'\\]+)/g))
      if (!/@\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(match[1] ?? ""))
        problems.push("Hook: pin the npm package to an exact version");
  }
  return problems;
}

function launchCommand(server: McpServer) {
  if (!server.command) throw new Error("Missing executable");
  if (process.platform === "win32" && server.command === "npx") {
    const script = (process.env.PATH ?? "")
      .split(path.delimiter)
      .filter((directory) => existsSync(path.join(directory, "npx.cmd")))
      .map((directory) => path.join(directory, "node_modules/npm/bin/npx-cli.js"))
      .find((file) => existsSync(file));
    if (!script) throw new Error("Cannot resolve npx without a shell");
    return { command: process.execPath, args: [script, ...(server.args ?? [])] };
  }
  return { command: server.command, args: server.args ?? [] };
}

const initializeResponse = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.literal(1),
  result: z.object({
    protocolVersion: z.string(),
    capabilities: z.object({}).passthrough(),
    serverInfo: z.object({ name: z.string(), version: z.string() })
  })
});
/** Defaults to Claude Code's 30 s MCP start-up limit; Serena alone needs about 10 s. */
export async function probeMcp(
  server: McpServer,
  timeoutMs = 30_000
): Promise<{ status: "passed" | "failed"; reason: string; cleanup: CleanupStatus }> {
  let child: ChildProcess | undefined;
  let outcome: { status: "passed" | "failed"; reason: string };
  try {
    const launch = launchCommand(server);
    child = spawn(launch.command, launch.args, {
      env: { ...controllerEnvironment(process.env, false), ...server.env },
      stdio: "pipe",
      windowsHide: true,
      detached: process.platform !== "win32"
    });
    const processChild = child;
    outcome = await new Promise((resolve) => {
      let settled = false;
      let buffer = "";
      const finish = (status: "passed" | "failed", reason: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ status, reason });
      };
      const timer = setTimeout(() => finish("failed", "Initialization timed out"), timeoutMs);
      processChild.once("error", () => finish("failed", "Process could not start"));
      processChild.once("close", () => finish("failed", "Process exited before initialization"));
      processChild.stdin?.on("error", () => finish("failed", "Initialization input closed"));
      processChild.stderr?.resume();
      processChild.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        if (buffer.length > 1024 * 1024)
          return finish("failed", "Initialization output exceeded limit");
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          try {
            const response = initializeResponse.safeParse(JSON.parse(line));
            if (response.success) {
              processChild.stdin?.write(
                `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`
              );
              finish("passed", "Initialization succeeded; tools were not invoked");
            } else if (z.object({ id: z.literal(1) }).safeParse(JSON.parse(line)).success)
              finish("failed", "Invalid initialization response");
          } catch {
            finish("failed", "Invalid protocol output");
          }
        }
      });
      processChild.stdin?.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "kaine-readiness", version: "1" } } })}\n`
      );
    });
  } catch {
    outcome = { status: "failed", reason: "Process could not start" };
  }
  const cleanup = child ? await stopProcessTree(child) : "not-started";
  return cleanup === "failed" || (outcome.status === "passed" && cleanup !== "passed")
    ? { status: "failed", reason: `${outcome.reason}; process cleanup failed`, cleanup }
    : { ...outcome, cleanup };
}
