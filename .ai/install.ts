#!/usr/bin/env tsx

import { cancel, intro, isCancel, multiselect, outro } from "@clack/prompts";
import chalk from "chalk";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";

import {
  type Agent,
  type AgentDefinition,
  CURSOR_RULES_SRC,
  discoverAgentDefinitions,
  discoverSkills,
  ensureLocalMcpEnv,
  isRecord,
  KAINE_PREFIX,
  LOCAL_MCP_SRC,
  MCP_JSON_EXAMPLE_SRC,
  missingEnvVarsForMcpServers,
  mcpEnvValue,
  type McpSource,
  mergeMcpSources,
  readGuideSource,
  readLocalMcpEnv,
  readMcpSource,
  readPersonalMcpSource,
  REPO_ROOT,
  renderAgentDoc,
  renderClaudeAgentDefinition,
  renderClaudeImport,
  renderClaudeSettings,
  renderClaudeSkill,
  renderCodexConfig,
  renderCodexSkill,
  renderCursorRulesFile,
  renderCursorSkill,
  renderGrokAgentDefinition,
  renderGrokConfig,
  renderGrokSessionStartHook,
  renderGrokSkill,
  renderMcpJson,
  renderOpencodeConfig,
  renderOpencodeSkill,
  renderReviewDoc,
  renderSerenaMemory,
  renderSerenaProject,
  resolveInstallMcpSource,
  REVIEW_OUT,
  REVIEW_SRC,
  SERENA_MEMORIES_SRC_DIR,
  SERENA_PROJECT_SRC,
  type Skill,
  writeGenerated,
  type WriteResult
} from "./ai.util";

interface InstallOptions {
  agents: Agent[];
  skills: string[];
  mcps: string[];
  nonInteractive: boolean;
}

let localMcpEnv: Record<string, string> = {};

const usage = `Usage:
  pnpm ai:install [--agent claude|codex|cursor|opencode|grok] [--skill <name|all>] [--mcp <name|all>] [--non-interactive]

Without selection flags and on a TTY, prompts interactively.
Otherwise defaults to: --agent claude --agent codex, all default skills, all default-eligible MCPs.
`;

const ALL_AGENTS: Agent[] = ["claude", "codex", "cursor", "opencode", "grok"];

const isAgent = (value: string): value is Agent => ALL_AGENTS.some((agent) => agent === value);

const SKILL_DIRS: Record<Agent, string> = {
  claude: ".claude/skills",
  codex: ".agents/skills",
  cursor: ".cursor/skills",
  opencode: ".opencode/skills",
  grok: ".grok/skills"
};

const AGENT_LABELS: Record<Agent, string> = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "OpenCode",
  grok: "Grok Build"
};

const parseListArg = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const detectAgents = (): Set<Agent> => {
  const home = homedir();
  const xdgConfig = process.env.XDG_CONFIG_HOME ?? join(home, ".config");
  const detected = new Set<Agent>();
  if (existsSync(join(home, ".claude"))) {
    detected.add("claude");
  }
  if (existsSync(join(home, ".codex"))) {
    detected.add("codex");
  }
  if (existsSync(join(home, ".cursor"))) {
    detected.add("cursor");
  }
  if (existsSync(join(home, ".opencode")) || existsSync(join(xdgConfig, "opencode"))) {
    detected.add("opencode");
  }
  if (existsSync(join(home, ".grok"))) {
    detected.add("grok");
  }
  return detected;
};

const promptAgents = async (): Promise<Agent[]> => {
  const detected = detectAgents();
  const result = await multiselect<Agent>({
    message: "Which AI coding tools do you use?",
    options: ALL_AGENTS.map((agent) => ({
      value: agent,
      label: AGENT_LABELS[agent],
      ...(detected.has(agent) ? { hint: "detected" } : {})
    })),
    initialValues: detected.size > 0 ? [...detected] : ["claude"],
    required: true
  });

  if (isCancel(result)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  return result;
};

const installedMcpsForAgent = (agent: Agent): Set<string> => {
  const result = new Set<string>();
  const configFile =
    agent === "claude"
      ? join(REPO_ROOT, ".mcp.json")
      : agent === "codex"
        ? join(REPO_ROOT, ".codex", "config.toml")
        : agent === "cursor"
          ? join(REPO_ROOT, ".cursor", "mcp.json")
          : agent === "grok"
            ? join(REPO_ROOT, ".grok", "config.toml")
            : join(REPO_ROOT, "opencode.json");

  if (!existsSync(configFile)) {
    return result;
  }

  const content = readFileSync(configFile, "utf8");
  if (configFile.endsWith(".toml")) {
    for (const match of content.matchAll(/^\[mcp_servers\.([\w-]+)]/gm)) {
      result.add(match[1]!);
    }
    return result;
  }

  try {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) {
      return result;
    }
    for (const name of Object.keys(isRecord(parsed.mcpServers) ? parsed.mcpServers : {})) {
      result.add(name);
    }
    for (const name of Object.keys(isRecord(parsed.mcp) ? parsed.mcp : {})) {
      result.add(name);
    }
  } catch {
    return result;
  }

  return result;
};

const installedMcpsForAgents = (agents: Agent[]): Set<string> => {
  const installed = new Set<string>();
  for (const agent of agents) {
    for (const name of installedMcpsForAgent(agent)) {
      installed.add(name);
    }
  }
  return installed;
};

const promptOptInMcps = async (agents: Agent[]): Promise<string[]> => {
  const source = readMcpSource();
  const optIns = Object.entries(source.mcpServers).filter(([, server]) => server.default === false);

  if (optIns.length === 0) {
    return [];
  }

  const installed = installedMcpsForAgents(agents);
  const result = await multiselect({
    message: "Optional MCPs (already-installed ones are pre-selected):",
    options: optIns.map(([name, server]) => {
      const envVars = Object.values(server.env ?? {})
        .map((value) => value.match(/^\$\{([A-Z0-9_]+)/)?.[1])
        .filter((value): value is string => Boolean(value));
      const hints = [
        installed.has(name) ? "installed" : null,
        envVars.length > 0 ? `requires ${envVars.join(", ")}` : null
      ].filter((value): value is string => Boolean(value));
      return {
        value: name,
        label: name,
        hint: hints.join(" · ")
      };
    }),
    initialValues: optIns.map(([name]) => name).filter((name) => installed.has(name)),
    required: false
  });

  if (isCancel(result)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  return result;
};

const parseArgs = (): InstallOptions => {
  const agents: Agent[] = [];
  const skills: string[] = [];
  const mcps: string[] = [];
  let nonInteractive = false;

  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    // `pnpm run ai:install -- --flag` forwards the separator itself (issue #367).
    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    }
    if (arg === "--non-interactive" || arg === "--no-interactive") {
      nonInteractive = true;
      continue;
    }
    if (arg === "--agent") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--agent requires a value");
      }
      for (const item of parseListArg(value)) {
        if (!isAgent(item)) {
          throw new Error(`Unsupported agent: ${item}`);
        }
        agents.push(item);
      }
      index += 1;
      continue;
    }
    if (arg === "--skill") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--skill requires a value");
      }
      skills.push(...parseListArg(value));
      index += 1;
      continue;
    }
    if (arg === "--mcp") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--mcp requires a value");
      }
      mcps.push(...parseListArg(value));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}\n\n${usage}`);
  }

  return {
    agents: [...new Set(agents)],
    skills,
    mcps,
    nonInteractive
  };
};

const selectSkills = (
  options: InstallOptions,
  allSkills: Skill[]
): { skills: Skill[]; envSkipped: string[] } => {
  const selected = new Set(options.skills);
  const knownNames = new Set(allSkills.map((skill) => skill.name));
  const unknown = [...selected].filter((name) => name !== "all" && !knownNames.has(name));

  if (unknown.length > 0) {
    throw new Error(
      `Unknown skill(s): ${unknown.join(", ")}\n\nAvailable: ${[...knownNames].sort().join(", ")}, all`
    );
  }

  let candidates: Skill[];
  if (selected.has("all")) {
    candidates = allSkills;
  } else if (selected.size === 0) {
    candidates = allSkills.filter((skill) => skill.isDefault);
  } else {
    candidates = allSkills.filter((skill) => selected.has(skill.name));
  }

  const envSkipped: string[] = [];
  const skills: Skill[] = [];
  for (const skill of candidates) {
    if (skill.requiresEnv.length === 0) {
      skills.push(skill);
      continue;
    }

    const missing = skill.requiresEnv.filter(
      (name) => mcpEnvValue(name, localMcpEnv) === undefined
    );
    if (missing.length > 0) {
      envSkipped.push(`${skill.name} (missing: ${missing.join(", ")})`);
      continue;
    }

    skills.push(skill);
  }

  return { skills, envSkipped };
};

const writeSharedOutputs = (allSkills: Skill[], results: WriteResult[]): void => {
  const guide = readGuideSource();
  writeGenerated(join(REPO_ROOT, "AGENTS.md"), renderAgentDoc(guide, allSkills), results);
  writeGenerated(join(REPO_ROOT, "CLAUDE.md"), renderClaudeImport(), results);

  if (existsSync(REVIEW_SRC)) {
    writeGenerated(REVIEW_OUT, renderReviewDoc(readFileSync(REVIEW_SRC, "utf8")), results);
  }

  if (existsSync(SERENA_PROJECT_SRC)) {
    // Seed once and never overwrite: Serena migrates this file in place on
    // schema upgrades, so rewriting it here would revert those migrations and
    // reopen a permanent drift loop. The file is gitignored; doctor checks its
    // semantics instead of its bytes.
    const serenaProjectPath = join(REPO_ROOT, ".serena", "project.yml");
    if (!existsSync(serenaProjectPath)) {
      writeGenerated(
        serenaProjectPath,
        renderSerenaProject(readFileSync(SERENA_PROJECT_SRC, "utf8")),
        results
      );
    }
  }

  if (existsSync(SERENA_MEMORIES_SRC_DIR)) {
    const seen = new Set<string>();
    for (const fileName of readdirSync(SERENA_MEMORIES_SRC_DIR).filter((file) =>
      file.endsWith(".md")
    )) {
      seen.add(fileName);
      writeGenerated(
        join(REPO_ROOT, ".serena", "memories", fileName),
        renderSerenaMemory(readFileSync(join(SERENA_MEMORIES_SRC_DIR, fileName), "utf8")),
        results
      );
    }

    const generatedDir = join(REPO_ROOT, ".serena", "memories");
    if (existsSync(generatedDir)) {
      for (const fileName of readdirSync(generatedDir)) {
        if (!fileName.endsWith(".md") || seen.has(fileName)) {
          continue;
        }
        const filePath = join(generatedDir, fileName);
        if (!readFileSync(filePath, "utf8").includes("GENERATED FILE")) {
          continue;
        }
        rmSync(filePath, { force: true });
      }
    }
  }
};

const installAgent = (
  agent: Agent,
  skills: Skill[],
  agentDefinitions: AgentDefinition[],
  options: InstallOptions,
  mergedMcp: McpSource,
  personalMcpNames: Set<string>,
  results: WriteResult[],
  removedSkills: string[]
): string[] => {
  const skippedMcps: string[] = [];
  const skillsDir = SKILL_DIRS[agent];
  const expected = new Set(
    skills.filter((skill) => skill.agents.includes(agent)).map((skill) => skill.name)
  );

  for (const skill of skills) {
    if (!skill.agents.includes(agent)) {
      continue;
    }

    const file = join(REPO_ROOT, skillsDir, skill.name, "SKILL.md");
    const render =
      agent === "claude"
        ? renderClaudeSkill
        : agent === "codex"
          ? renderCodexSkill
          : agent === "cursor"
            ? renderCursorSkill
            : agent === "grok"
              ? renderGrokSkill
              : renderOpencodeSkill;

    writeGenerated(file, render(skill), results);
  }

  const dirAbs = join(REPO_ROOT, skillsDir);
  if (existsSync(dirAbs)) {
    for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
      if (
        !entry.isDirectory() ||
        !entry.name.startsWith(KAINE_PREFIX) ||
        expected.has(entry.name)
      ) {
        continue;
      }

      rmSync(join(dirAbs, entry.name), { recursive: true, force: true });
      removedSkills.push(`${agent}: ${entry.name}`);
    }
  }

  const resolved = resolveInstallMcpSource(mergedMcp, {
    agent,
    mcps: options.mcps,
    personalNames: personalMcpNames,
    localEnv: localMcpEnv
  });
  skippedMcps.push(...resolved.skipped);

  if (agent === "claude") {
    writeGenerated(join(REPO_ROOT, ".mcp.json"), renderMcpJson(resolved.source), results);
    writeGenerated(join(REPO_ROOT, ".claude", "settings.json"), renderClaudeSettings(), results);

    const agentsDirAbs = join(REPO_ROOT, ".claude", "agents");
    const expectedAgentDefs = new Set(agentDefinitions.map((definition) => definition.name));
    for (const definition of agentDefinitions) {
      writeGenerated(
        join(agentsDirAbs, `${definition.name}.md`),
        renderClaudeAgentDefinition(definition),
        results
      );
    }

    if (existsSync(agentsDirAbs)) {
      for (const entry of readdirSync(agentsDirAbs, { withFileTypes: true })) {
        if (
          !entry.isFile() ||
          !entry.name.endsWith(".md") ||
          !entry.name.startsWith(KAINE_PREFIX) ||
          expectedAgentDefs.has(entry.name.replace(/\.md$/, ""))
        ) {
          continue;
        }

        rmSync(join(agentsDirAbs, entry.name), { force: true });
        removedSkills.push(`${agent}: ${entry.name}`);
      }
    }
  }
  if (agent === "codex") {
    writeGenerated(
      join(REPO_ROOT, ".codex", "config.toml"),
      renderCodexConfig(resolved.source),
      results
    );
  }
  if (agent === "cursor") {
    writeGenerated(join(REPO_ROOT, ".cursor", "mcp.json"), renderMcpJson(resolved.source), results);
    if (existsSync(CURSOR_RULES_SRC)) {
      writeGenerated(
        join(REPO_ROOT, ".cursor", "rules", "kaine-rules.mdc"),
        renderCursorRulesFile(readFileSync(CURSOR_RULES_SRC, "utf8")),
        results
      );
    }
  }
  if (agent === "opencode") {
    writeGenerated(
      join(REPO_ROOT, "opencode.json"),
      renderOpencodeConfig(resolved.source),
      results
    );
  }
  if (agent === "grok") {
    writeGenerated(
      join(REPO_ROOT, ".grok", "config.toml"),
      renderGrokConfig(resolved.source),
      results
    );
    writeGenerated(
      join(REPO_ROOT, ".grok", "hooks", "kaine-session-start.json"),
      renderGrokSessionStartHook(),
      results
    );

    const agentsDirAbs = join(REPO_ROOT, ".grok", "agents");
    const expectedAgentDefs = new Set(agentDefinitions.map((definition) => definition.name));
    for (const definition of agentDefinitions) {
      writeGenerated(
        join(agentsDirAbs, `${definition.name}.md`),
        renderGrokAgentDefinition(definition),
        results
      );
    }

    if (existsSync(agentsDirAbs)) {
      for (const entry of readdirSync(agentsDirAbs, { withFileTypes: true })) {
        if (
          !entry.isFile() ||
          !entry.name.endsWith(".md") ||
          !entry.name.startsWith(KAINE_PREFIX) ||
          expectedAgentDefs.has(entry.name.replace(/\.md$/, ""))
        ) {
          continue;
        }

        rmSync(join(agentsDirAbs, entry.name), { force: true });
        removedSkills.push(`${agent}: ${entry.name}`);
      }
    }
  }

  return skippedMcps;
};

const main = async (): Promise<void> => {
  const options = parseArgs();
  const userExplicit =
    options.agents.length > 0 || options.skills.length > 0 || options.mcps.length > 0;
  const canPrompt = Boolean(process.stdout.isTTY) && !options.nonInteractive;
  const interactive = canPrompt && !userExplicit;

  if (interactive) {
    intro(chalk.cyan("🛠  Install AI assistant config"));
    options.agents = await promptAgents();
    const optInPicks = await promptOptInMcps(options.agents);
    if (optInPicks.length > 0) {
      const defaultMcps = Object.entries(readMcpSource().mcpServers)
        .filter(([, server]) => server.default !== false)
        .map(([name]) => name);
      options.mcps = [...defaultMcps, ...optInPicks];
    }
    outro(chalk.gray("Installing..."));
  } else if (options.agents.length === 0) {
    options.agents = ["claude", "codex"];
  }

  const didCreateLocalMcpEnv = ensureLocalMcpEnv();
  localMcpEnv = readLocalMcpEnv();

  const allSkills = discoverSkills();
  const agentDefinitions = discoverAgentDefinitions();
  const teamMcp = readMcpSource();
  const personalMcp = readPersonalMcpSource();
  const merged = mergeMcpSources(teamMcp, personalMcp);

  const mcpSelection = new Set(options.mcps);
  const knownMcps = new Set(Object.keys(merged.source.mcpServers));
  const unknownMcps = [...mcpSelection].filter((name) => name !== "all" && !knownMcps.has(name));
  if (unknownMcps.length > 0) {
    throw new Error(
      `Unknown MCP server(s): ${unknownMcps.join(", ")}\n\nAvailable: ${[...knownMcps].sort().join(", ")}, all`
    );
  }

  const { skills, envSkipped } = selectSkills(options, allSkills);
  const results: WriteResult[] = [];
  const removedSkills: string[] = [];
  const skippedMcps = new Set<string>();

  writeSharedOutputs(allSkills, results);

  for (const agent of options.agents) {
    for (const skipped of installAgent(
      agent,
      skills,
      agentDefinitions,
      options,
      merged.source,
      merged.personalNames,
      results,
      removedSkills
    )) {
      skippedMcps.add(skipped);
    }
  }

  if (!interactive) {
    console.log(chalk.cyan("🛠  Install AI assistant config"));
    console.log();
    console.log(chalk.bold("Agents"));
    console.log(chalk.gray(`  ${options.agents.join(", ")}`));
    console.log();
  }

  const changed = results.filter((result) => result.status !== "unchanged");
  if (changed.length === 0) {
    console.log(chalk.green(`✓ All ${results.length} local file(s) already up-to-date.`));
  } else {
    console.log(chalk.bold(`Changes (${changed.length})`));
    for (const result of changed) {
      const icon =
        result.status === "created"
          ? chalk.green("+ created")
          : result.status === "updated"
            ? chalk.cyan("~ updated")
            : chalk.gray(result.status);
      console.log(`  ${icon}  ${chalk.gray(relative(REPO_ROOT, result.file))}`);
    }
  }

  if (removedSkills.length > 0) {
    console.log();
    console.log(chalk.yellow("⚠ Removed stale skill(s):"));
    for (const entry of removedSkills) {
      console.log(chalk.yellow(`    ${entry}`));
    }
  }

  if (envSkipped.length > 0) {
    console.log();
    console.log(chalk.yellow("⚠ Skipped skill(s):"));
    for (const skill of envSkipped) {
      console.log(chalk.yellow(`    ${skill}`));
    }
  }

  if (merged.personalNames.size > 0) {
    console.log();
    console.log(
      chalk.cyan(`ℹ Personal MCP(s) merged: ${[...merged.personalNames].sort().join(", ")}`)
    );
  }

  if (merged.collisions.length > 0) {
    console.log();
    console.log(
      chalk.yellow(
        `⚠ Personal MCP(s) shadowed by team source: ${[...merged.collisions].sort().join(", ")}`
      )
    );
    console.log(chalk.gray("  Rename them in .ai.local/mcp.json or remove the team entry."));
  }

  if (didCreateLocalMcpEnv) {
    console.log();
    console.log(chalk.cyan("ℹ Created .ai.local/mcp.env from .ai/mcp.env.example."));
    console.log(chalk.gray("  Fill it in and rerun ai:install for MCPs/skills that need secrets."));
  }

  if (!existsSync(LOCAL_MCP_SRC) && existsSync(MCP_JSON_EXAMPLE_SRC)) {
    console.log();
    console.log(chalk.gray("ℹ Personal MCP overrides can be added in .ai.local/mcp.json."));
    console.log(chalk.gray(`  Example: ${relative(REPO_ROOT, MCP_JSON_EXAMPLE_SRC)}`));
  }

  if (skippedMcps.size > 0) {
    const missingVars = missingEnvVarsForMcpServers(merged.source, skippedMcps, localMcpEnv);
    console.log();
    console.log(chalk.yellow(`⚠ Skipped MCP server(s): ${[...skippedMcps].sort().join(", ")}`));
    console.log(chalk.gray(`  Missing env vars: ${missingVars.join(", ")}`));
    console.log(chalk.gray("  Run `pnpm ai:doctor` for setup details."));
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
