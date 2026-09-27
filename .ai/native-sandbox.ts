import { spawn } from "node:child_process";
import { z } from "zod";

import { controllerEnvironment } from "./agent-run.util";
import { stopProcessTree } from "./process-cleanup.util";

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

export function inspectEffectivePermissions(
  config: z.infer<ReturnType<typeof z.json>>,
  profileName: string
) {
  const selected = z
    .object({
      default_permissions: z.string().nullable().optional(),
      approval_policy: z.json().optional(),
      sandbox_mode: z.string().nullable().optional(),
      windows: z.object({ sandbox: z.string().optional() }).optional(),
      permissions: z
        .record(
          z.string(),
          z.object({
            filesystem: z.json().optional(),
            network: z.object({ enabled: z.boolean().optional() }).optional()
          })
        )
        .optional()
    })
    .parse(config);
  return {
    source: "config/read",
    defaultPermissions: selected.default_permissions ?? null,
    approvalPolicy: selected.approval_policy ?? null,
    legacySandboxMode: selected.sandbox_mode ?? null,
    windowsSandbox: selected.windows?.sandbox ?? null,
    selectedProfile: {
      filesystem: selected.permissions?.[profileName]?.filesystem ?? null,
      network: { enabled: selected.permissions?.[profileName]?.network?.enabled ?? null }
    }
  };
}

/** command/exec uses the native elevated path; the Windows `sandbox` debug CLI uses a restricted token. */
export async function runNativeProbe(input: {
  config: string[];
  workspace: string;
  profileName: string;
  command: string[];
  onConfiguration?: (config: ReturnType<typeof inspectEffectivePermissions>) => void;
}): Promise<string> {
  const child = spawn("codex", ["app-server", "--strict-config", ...input.config], {
    cwd: input.workspace,
    env: {
      ...controllerEnvironment(process.env, false),
      KAINE_PROBE_SECRET: "synthetic-controller-only"
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32"
  });
  let buffer = "";
  const send = (message: z.infer<ReturnType<typeof z.json>>) =>
    child.stdin.write(`${JSON.stringify(message)}\n`);
  let failure: Error | undefined;
  let output = "";
  try {
    output = await new Promise<string>((resolve, reject) => {
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
              finish(new Error("Native sandbox preflight rejected"));
              return;
            }
            if (response.id === 1) {
              send({ method: "initialized" });
              send({
                id: 4,
                method: "config/read",
                params: { cwd: input.workspace, includeLayers: false }
              });
            }
            if (response.id === 4) {
              const effective = z.object({ config: z.json() }).parse(response.result);
              input.onConfiguration?.(
                inspectEffectivePermissions(effective.config, input.profileName)
              );
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
                result.exitCode === 0 ? null : new Error("Native probe command failed"),
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
  } catch (error) {
    failure = error instanceof Error ? error : new Error("Native preflight failed");
  }
  if ((await stopProcessTree(child)) !== "passed")
    throw new Error(`${failure?.message ?? "Native preflight completed"}; process cleanup failed`);
  if (failure) throw failure;
  return output;
}
