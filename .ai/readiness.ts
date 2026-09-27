import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parse } from "smol-toml";
import { z } from "zod";

import {
  type Agent,
  computeAgentDefinitionDrift,
  discoverAgentDefinitions,
  discoverSkills,
  mergeMcpSources,
  mcpEnvValue,
  readMcpSource,
  readPersonalMcpSource,
  readLocalMcpEnv,
  REPO_ROOT
} from "./ai.util";
import { agentSchema, readInstallSelection } from "./install-state.util";
import {
  commandExists,
  computeSharedDrift,
  computeSkillDrift,
  computeHookDrift,
  envRequirements,
  SKILL_DIRS
} from "./installation.util";
import { probeMcp, validateMcpPins } from "./mcp-probe.util";
import { inspectSerenaPrompt } from "./serena-prompt.util";

const serverSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
  disabled: z.boolean().optional()
});
const configSchema = z.object({
  mcpServers: z.record(z.string(), serverSchema).optional(),
  mcp_servers: z.record(z.string(), serverSchema).optional(),
  mcp: z
    .record(
      z.string(),
      z.object({
        command: z.array(z.string()).optional(),
        environment: z.record(z.string(), z.string()).optional(),
        enabled: z.boolean().optional()
      })
    )
    .optional()
});
export const agentConfigPaths = {
  claude: ".mcp.json",
  codex: ".codex/config.toml",
  cursor: ".cursor/mcp.json",
  opencode: "opencode.json",
  grok: ".grok/config.toml"
} satisfies Record<Agent, string>;

export function installedServers(agent: Agent, root = REPO_ROOT, includeDisabled = false) {
  const file = path.join(root, agentConfigPaths[agent]);
  if (!existsSync(file)) throw new Error(`Missing ${agent} configuration`);
  const content = readFileSync(file, "utf8");
  const result = configSchema.safeParse(
    file.endsWith(".toml") ? parse(content) : JSON.parse(content)
  );
  if (!result.success) throw new Error(`Invalid ${agent} configuration`);
  const servers =
    result.data.mcpServers ??
    result.data.mcp_servers ??
    Object.fromEntries(
      Object.entries(result.data.mcp ?? {}).map(([name, server]) => [
        name,
        {
          command: server.command?.[0],
          args: server.command?.slice(1),
          env: server.environment,
          enabled: server.enabled
        }
      ])
    );
  return Object.fromEntries(
    Object.entries(servers).filter(
      ([, server]) =>
        includeDisabled || (server.enabled !== false && !("disabled" in server && server.disabled))
    )
  );
}

export function inspectInstallation(agent: Agent, includeContext = false) {
  const problems: string[] = [];
  const skills = discoverSkills();
  const selection = readInstallSelection(agent);
  problems.push(
    ...computeSharedDrift(skills)
      .filter(
        (entry) => entry.tracked && (agent === "claude" || !entry.label.startsWith(".claude/"))
      )
      .map((entry) => `${entry.label}: ${entry.status}`)
  );
  const dir = SKILL_DIRS.find((entry) => entry.agent === agent);
  if (
    (!selection || selection.skills.length > 0) &&
    (!dir || !existsSync(path.join(REPO_ROOT, dir.dir)))
  )
    problems.push(`Missing ${agent} skills`);
  for (const drift of computeSkillDrift(skills, REPO_ROOT, agent).filter(
    (entry) => entry.agent === agent
  )) {
    for (const name of drift.missing) problems.push(`Missing skill: ${name}`);
    for (const name of drift.stale) problems.push(`Stale skill: ${name}`);
    for (const name of drift.orphan) problems.push(`Orphan skill: ${name}`);
  }
  const prefixes = {
    codex: ".codex/",
    claude: ".claude/",
    grok: ".grok/",
    cursor: ".cursor/",
    opencode: ".opencode/"
  } satisfies Record<Agent, string>;
  problems.push(
    ...computeHookDrift()
      .filter((entry) => entry.label.startsWith(prefixes[agent]))
      .map((entry) => `${entry.label}: ${entry.status}`)
  );
  if (agent === "claude" || agent === "grok") {
    const drift = computeAgentDefinitionDrift(
      discoverAgentDefinitions(),
      path.join(REPO_ROOT, `.${agent}`, "agents")
    );
    problems.push(
      ...drift.missing.map((name) => `Missing agent definition: ${name}`),
      ...drift.stale.map((name) => `Stale agent definition: ${name}`),
      ...drift.orphan.map((name) => `Orphan agent definition: ${name}`)
    );
  }
  const servers = installedServers(agent);
  if (!selection) problems.push(`Missing ${agent} installation selection; rerun ai:install`);
  for (const name of selection?.mcps ?? [])
    if (!(name in installedServers(agent, REPO_ROOT, true)))
      problems.push(`Missing selected MCP: ${name}`);
  const source = mergeMcpSources(readMcpSource(), readPersonalMcpSource()).source;
  const localEnv = readLocalMcpEnv();
  for (const skill of skills.filter((entry) => selection?.skills.includes(entry.name))) {
    const missing = skill.requiresEnv.filter((name) => mcpEnvValue(name, localEnv) === undefined);
    if (missing.length) problems.push(`${skill.name}: missing ${missing.join(", ")}`);
  }
  for (const name of selection?.schemaVersion === 2 ? selection.ownedMcps : []) {
    if (!source.mcpServers[name] && name in installedServers(agent, REPO_ROOT, true))
      problems.push(`${name}: removed team MCP remains installed; rerun ai:install`);
  }
  for (const [name, server] of Object.entries(servers)) {
    if (!commandExists(server.command)) problems.push(`${name}: missing executable`);
    const canonical = source.mcpServers[name];
    if (canonical) {
      const missing = envRequirements(
        { ...canonical, env: { ...canonical.env, ...server.env } },
        localEnv
      ).filter((item) => !item.isSet && !item.hasFallback);
      if (missing.length)
        problems.push(`${name}: missing ${missing.map((item) => item.name).join(", ")}`);
      if (
        canonical.command !== server.command ||
        JSON.stringify(canonical.args ?? []) !== JSON.stringify(server.args ?? [])
      )
        problems.push(`${name}: stale launch configuration`);
    }
  }
  problems.push(...validateMcpPins(readMcpSource()));
  const serena = inspectSerenaPrompt(
    REPO_ROOT,
    agent === "claude" && selection?.mcps.includes("serena") && servers.serena
      ? source.mcpServers.serena
      : undefined
  );
  return {
    serenaPrompt: serena.status,
    ...(includeContext && serena.status === "ready" ? { startupContext: serena.prompt } : {}),
    schemaVersion: 1,
    agent,
    installation: problems.length ? "needs-attention" : "ready",
    problems,
    runtime: { mcp: "not-verified", sandbox: "not-verified" }
  };
}

export async function runReadinessCommand() {
  let json = process.argv.includes("--json");
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2).filter((arg) => arg !== "--"),
      options: {
        agent: { type: "string" },
        local: { type: "boolean" },
        json: { type: "boolean" },
        strict: { type: "boolean" },
        "probe-mcp": { type: "boolean" },
        "startup-context": { type: "boolean" }
      }
    });
    json = values.json ?? false;
    const agent = agentSchema.parse(values.agent);
    const report = inspectInstallation(agent, values["startup-context"]);
    const probes = [];
    if (values["probe-mcp"]) {
      for (const [name, server] of Object.entries(installedServers(agent)))
        probes.push({ name, ...(await probeMcp(server)) });
    }
    const failed = report.problems.length > 0 || probes.some((probe) => probe.status !== "passed");
    const output = {
      ...report,
      runtime: {
        ...report.runtime,
        mcp: probes.length ? (failed ? "failed" : "passed") : "not-verified"
      },
      probes
    };
    console.log(
      json
        ? JSON.stringify(output)
        : `${agent}: ${report.installation}\n${report.problems.join("\n")}\nMCP runtime: ${output.runtime.mcp}; sandbox: not-verified`
    );
    if (failed) process.exitCode = 1;
  } catch {
    const result = {
      installation: "not-verified",
      problems: [
        "Inspection failed. Check --agent and configuration; run pnpm ai:install for the selected agent."
      ],
      runtime: { mcp: "not-verified", sandbox: "not-verified" }
    };
    console.log(json ? JSON.stringify(result) : result.problems.join("\n"));
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void runReadinessCommand();
