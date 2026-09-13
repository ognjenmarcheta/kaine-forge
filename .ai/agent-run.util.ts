import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { parse } from "smol-toml";
import { z } from "zod";

import { renderCodexConfig } from "./ai.util";

export function parseAgentRunOptions(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      workspace: { type: "string", default: process.cwd() },
      "prompt-file": { type: "string" },
      model: { type: "string" },
      mode: { type: "string", default: "read" },
      timeout: { type: "string", default: "1800" },
      "save-transcript": { type: "boolean", default: false },
      "probe-only": { type: "boolean", default: false }
    }
  });
  return z
    .object({
      workspace: z.string().min(1),
      "prompt-file": z.string().min(1).optional(),
      model: z.string().trim().min(1).optional(),
      mode: z.enum(["read", "edit"]),
      timeout: z.coerce.number().int().min(1).max(7200),
      "save-transcript": z.boolean(),
      "probe-only": z.boolean()
    })
    .superRefine((input, ctx) => {
      if (!input["probe-only"] && (!input.model || !input["prompt-file"]))
        ctx.addIssue({ code: "custom", message: "Runs require --model and --prompt-file" });
    })
    .parse(values);
}

export function assertSupportedSandbox(platform: NodeJS.Platform, version: string): void {
  if (platform !== "win32") throw new Error("This runner is verified for native Windows only");
  const match = /codex-cli (\d+)\.(\d+)\.(\d+)/.exec(version);
  if (
    !match ||
    Number(match[1]) !== 0 ||
    Number(match[2]) < 153 ||
    (Number(match[2]) === 153 && Number(match[3]) < 4)
  )
    throw new Error(
      "Codex CLI 0.153.4 or newer is required; run boundary probes after every upgrade"
    );
}

export function commandEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  const allowed: Record<string, string> = {};
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "ComSpec",
    "PATHEXT",
    "ProgramFiles",
    "ProgramFiles(x86)"
  ]) {
    const value = env[key];
    if (value) allowed[key] = value;
  }
  return allowed;
}

export function controllerEnvironment(
  env: NodeJS.ProcessEnv,
  includeCredential: boolean
): Record<string, string> {
  const result = commandEnvironment(env);
  for (const key of [
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "USERNAME",
    "USERDOMAIN",
    "TEMP",
    "TMP",
    "CODEX_HOME",
    ...(includeCredential ? ["OPENAI_API_KEY"] : [])
  ]) {
    if (env[key]) result[key] = env[key];
  }
  return result;
}

/** Inspect every project-config ancestor; legacy settings override permission profiles. */
export function projectConfigRestrictions(workspace: string) {
  const selected = realpathSync(workspace);
  let current = selected;
  for (;;) {
    const file = path.join(current, ".codex", "config.toml");
    // exec ignores personal configuration; command/exec explicitly selects our unique profile.
    const personal = path.resolve(
      process.env["CODEX_HOME"] ?? path.join(homedir(), ".codex"),
      "config.toml"
    );
    if (existsSync(file) && path.resolve(file).toLowerCase() !== personal.toLowerCase()) {
      const config = parse(readFileSync(file, "utf8"));
      const expectedHooks = parse(renderCodexConfig({ mcpServers: {} }))["hooks"];
      if (
        (current === selected || config["hooks"]) &&
        JSON.stringify(config["hooks"]) !== JSON.stringify(expectedHooks)
      )
        throw new Error(
          `Unrecognized hooks in ${file}; this runner only trusts generated Kaine hooks`
        );
      if (
        "sandbox_mode" in config ||
        "sandbox_workspace_write" in config ||
        "profiles" in config ||
        "permissions" in config
      )
        throw new Error(
          `Remove conflicting sandbox/profile settings from ${file} before using this opt-in runner`
        );
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function sandboxConfig(input: {
  profileName: string;
  temporary: string;
  outside: string;
  mode: "read" | "edit";
  nodeDirectory: string;
  commandEnv: Record<string, string>;
}): string[] {
  const quote = (value: string) => JSON.stringify(value.replaceAll("\\", "/"));
  const table = (entries: [string, string][]) =>
    `{ ${entries.map(([key, value]) => `${quote(key)} = ${value}`).join(", ")} }`;
  const access = quote(input.mode === "edit" ? "write" : "read");
  const protectedPaths = [
    ".env",
    ".env.*",
    "**/.env",
    "**/.env.*",
    ".ai.local",
    ".git",
    ".codex",
    ".claude",
    ".ai/permissions.json",
    ".ai/hooks"
  ];
  const workspaceRules: [string, string][] = [
    [".", access],
    ...protectedPaths.map((name): [string, string] => [name, '"deny"'])
  ];
  // Pass this as one TOML value: dotted CLI override keys do not preserve quoted path components.
  const filesystem = table([
    [":minimal", '"read"'],
    ["glob_scan_max_depth", "12"],
    [input.nodeDirectory, '"read"'],
    [input.temporary, access],
    [input.outside, '"deny"'],
    [":workspace_roots", table(workspaceRules)]
  ]);
  const settings = [
    `default_permissions=${quote(input.profileName)}`,
    'approval_policy="never"',
    'windows.sandbox="elevated"',
    `permissions=${table([[input.profileName, `{ filesystem = ${filesystem}, network = { enabled = false } }`]])}`,
    'web_search="disabled"',
    "mcp_servers={}",
    "features.hooks=true",
    "features.apps=false",
    "features.plugins=false",
    "features.browser_use=false",
    "features.browser_use_external=false",
    "features.in_app_browser=false",
    "features.computer_use=false",
    "features.multi_agent=false",
    "features.multi_agent_v2=false",
    'shell_environment_policy.inherit="none"',
    `shell_environment_policy.set=${table(Object.entries({ ...input.commandEnv, TEMP: input.temporary, TMP: input.temporary }).map(([key, value]) => [key, quote(value)]))}`
  ];
  return settings.flatMap((setting) => ["-c", setting]);
}

export const probeResultSchema = z.object({
  outsideReadDenied: z.literal(true),
  environmentFileDenied: z.literal(true),
  gitDenied: z.literal(true),
  environmentIsolated: z.literal(true),
  allowedRead: z.literal(true),
  expectedWrite: z.literal(true),
  protectedDenied: z.literal(true),
  outsideWriteDenied: z.literal(true),
  networkDenied: z.literal(true)
});
