import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { controllerEnvironment } from "./agent-run.util";
import { type McpServer, type McpSource } from "./ai.util";

export function validateMcpPins(source: McpSource): string[] {
  const problems: string[] = [];
  for (const [name, server] of Object.entries(source.mcpServers)) {
    if (server.command === "npx") {
      const specifier = server.args?.find((arg) => !arg.startsWith("-"));
      if (!specifier || !/@\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(specifier))
        problems.push(`${name}: pin the npm package to an exact version`);
    }
    for (const arg of server.args ?? []) {
      if (arg.startsWith("git+") && !/@[a-f0-9]{40}$/.test(arg))
        problems.push(`${name}: pin the Git dependency to a commit`);
    }
  }
  return problems;
}

export async function stopProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore"
      });
      const timer = setTimeout(() => {
        killer.kill();
        child.kill();
        resolve();
      }, 2000);
      const finish = () => {
        clearTimeout(timer);
        resolve();
      };
      killer.once("error", finish);
      killer.once("close", finish);
    });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
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
export async function probeMcp(
  server: McpServer,
  timeoutMs = 10_000
): Promise<{ status: "passed" | "failed"; reason: string }> {
  let child: ChildProcess | undefined;
  try {
    const launch = launchCommand(server);
    child = spawn(launch.command, launch.args, {
      env: { ...controllerEnvironment(process.env, false), ...server.env },
      stdio: "pipe",
      windowsHide: true,
      detached: process.platform !== "win32"
    });
    const processChild = child;
    return await new Promise((resolve) => {
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
    return { status: "failed", reason: "Process could not start" };
  } finally {
    if (child) await stopProcessTree(child);
  }
}
