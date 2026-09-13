import { spawn } from "node:child_process";
import { z } from "zod";

import { controllerEnvironment } from "./agent-run.util";

const responseSchema = z.object({
  id: z.number().optional(),
  result: z.json().optional(),
  error: z.object({ message: z.string() }).optional()
});
const commandResultSchema = z.object({
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string()
});

/** command/exec uses the native elevated path; the Windows `sandbox` debug CLI uses a restricted token. */
export async function runNativeProbe(input: {
  config: string[];
  workspace: string;
  profileName: string;
  command: string[];
}): Promise<string> {
  const child = spawn("codex", ["app-server", "--strict-config", ...input.config], {
    cwd: input.workspace,
    env: {
      ...controllerEnvironment(process.env, false),
      KAINE_PROBE_SECRET: "synthetic-controller-only"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  let buffer = "";
  const send = (message: z.infer<ReturnType<typeof z.json>>) =>
    child.stdin.write(`${JSON.stringify(message)}\n`);
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Native sandbox preflight timed out")),
        35_000
      );
      const finish = (error: Error | null, stdout = "") => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(stdout);
      };
      child.once("error", () => finish(new Error("Native Codex app-server unavailable")));
      child.once("close", () =>
        finish(new Error("Native sandbox preflight closed before completion"))
      );
      child.stderr.resume();
      child.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          try {
            const response = responseSchema.parse(JSON.parse(line));
            if (response.error) {
              finish(new Error(`Native sandbox preflight rejected: ${response.error.message}`));
              return;
            }
            if (response.id === 1) {
              send({ method: "initialized" });
              send({ id: 2, method: "windowsSandbox/readiness", params: {} });
            }
            if (response.id === 2) {
              const readiness = z
                .object({ status: z.enum(["ready", "notConfigured", "updateRequired"]) })
                .parse(response.result);
              if (readiness.status !== "ready") {
                finish(
                  new Error(
                    `Native Windows sandbox ${readiness.status}; administrator-assisted setup is required`
                  )
                );
                return;
              }
              send({
                id: 3,
                method: "command/exec",
                params: {
                  command: input.command,
                  cwd: input.workspace,
                  permissionProfile: input.profileName,
                  timeoutMs: 30_000
                }
              });
            }
            if (response.id === 3) {
              const result = commandResultSchema.parse(response.result);
              finish(
                result.exitCode === 0
                  ? null
                  : new Error(`Native probe command failed: ${result.stderr.slice(0, 1200)}`),
                result.stdout
              );
            }
          } catch {
            finish(new Error("Invalid native sandbox preflight response"));
          }
        }
      });
      send({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "kaine-boundary-probe", version: "1" },
          capabilities: { experimentalApi: true }
        }
      });
    });
  } finally {
    child.stdin.end();
    child.kill();
  }
}
