import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { controllerEnvironment } from "./agent-run.util";
import { type McpServer } from "./ai.util";
import { stopProcessTree } from "./process-cleanup.util";

const cacheSchema = z.object({
  schemaVersion: z.literal(1),
  fingerprint: z.string(),
  prompt: z.string().min(1).max(65536)
});
const cachePath = (root: string) => path.join(root, ".ai.local/serena/claude-prompt.json");
const fingerprint = (server: McpServer) =>
  createHash("sha256")
    .update(JSON.stringify([server.command, server.args ?? []]))
    .digest("hex");

function preparationArgs(server: McpServer) {
  const args = server.args ?? [];
  const source = args[1];
  if (
    server.command !== "uvx" ||
    args[0] !== "--from" ||
    !source ||
    !/^git\+\S+@[a-f0-9]{40}$/.test(source) ||
    args[2] !== "serena" ||
    args[3] !== "start-mcp-server"
  )
    throw new Error(
      "Unsupported Serena override: prompt preparation requires uvx --from <Git URL pinned to a commit> serena start-mcp-server"
    );
  return ["--from", source, "serena", "prompts", "print-cc-system-prompt-override"];
}

export function inspectSerenaPrompt(root: string, server?: McpServer) {
  if (!server) return { status: "disabled" as const };
  try {
    preparationArgs(server);
  } catch {
    return { status: "unsupported" as const };
  }
  try {
    const cached = cacheSchema.parse(JSON.parse(readFileSync(cachePath(root), "utf8")));
    if (cached.fingerprint !== fingerprint(server)) return { status: "stale" as const };
    return { status: "ready" as const, prompt: cached.prompt };
  } catch {
    return { status: "not-prepared" as const };
  }
}

/** Explicit installation only. Startup reads the cache and never launches Serena. */
export async function prepareSerenaPrompt(root: string, server: McpServer) {
  const args = preparationArgs(server);
  const child = spawn("uvx", args, {
    env: controllerEnvironment(process.env, false),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32"
  });
  let prompt = "";
  let failure: Error | undefined;
  try {
    prompt = await new Promise<string>((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => reject(new Error("Serena preparation timed out")), 60_000);
      child.once("error", () => {
        clearTimeout(timer);
        reject(new Error("Serena preparation could not start"));
      });
      const consume = (chunk: Buffer, keep: boolean) => {
        size += chunk.length;
        if (size > 65536) {
          clearTimeout(timer);
          reject(new Error("Serena prompt exceeds 64 KiB"));
        } else if (keep) chunks.push(chunk);
      };
      child.stdout.on("data", (chunk: Buffer) => consume(chunk, true));
      child.stderr.on("data", (chunk: Buffer) => consume(chunk, false));
      child.stdin.on("error", () => {
        clearTimeout(timer);
        reject(new Error("Serena preparation input closed"));
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error("Serena prompt preparation failed"));
        else resolve(Buffer.concat(chunks).toString("utf8"));
      });
      child.stdin.end();
    });
  } catch (error) {
    failure = error instanceof Error ? error : new Error("Serena preparation failed");
  }
  const cleanup = await stopProcessTree(child);
  if (failure || cleanup !== "passed")
    throw new Error(
      `${failure?.message ?? "Serena preparation completed"}${cleanup !== "passed" ? "; process cleanup failed" : ""}`
    );
  const value = cacheSchema.parse({ schemaVersion: 1, fingerprint: fingerprint(server), prompt });
  const file = cachePath(root);
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value)}\n`);
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}
