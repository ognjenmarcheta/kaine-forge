#!/usr/bin/env tsx

import { cancel, intro, isCancel, multiselect, outro } from "@clack/prompts";
import chalk from "chalk";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";

import { AGENT_REGISTRY } from "./agent-registry.util";
import {
  type Agent,
  type AgentDefinition,
  AGENTS,
  discoverAgentDefinitions,
  discoverSkills,
  ensureLocalMcpEnv,
  generatedTextEqual,
  managedNamePredicate,
  LOCAL_MCP_SRC,
  MCP_JSON_EXAMPLE_SRC,
  missingEnvVarsForMcpServers,
  mcpEnvValue,
  type McpSource,
  mergeMcpSources,
  mergeSerenaProjectSeed,
  readGuideSource,
  readLocalMcpEnv,
  readMcpSource,
  readPersonalMcpSource,
  REPO_ROOT,
  renderAgentDoc,
  renderClaudeImport,
  removeLegacyOpencodeGuardrail,
  renderReviewDoc,
  renderSerenaMemory,
  renderSerenaProject,
  resolveInstallMcpSource,
  validateMcpServers,
  REVIEW_OUT,
  REVIEW_SRC,
  SERENA_INTERFACES,
  SERENA_MEMORIES_SRC_DIR,
  SERENA_PROJECT_SRC,
  type SerenaInterface,
  type Skill,
  writeGenerated,
  type WriteResult
} from "./ai.util";
import { mergeInstalledConfig } from "./install-config.util";
import {
  chooseInstallSelection,
  chooseSerenaInterface,
  managedMcpOwnership,
  newDefaultSkills,
  readInstallSelection,
  writeInstallSelection
} from "./install-state.util";
import { installedServers } from "./readiness";
import { prepareSerenaPrompt, usesSerenaRepl } from "./serena-prompt.util";

interface InstallOptions {
  agents: Agent[];
  skills: string[];
  mcps: string[];
  auto: boolean;
  nonInteractive: boolean;
  prepareSerena: boolean;
  serenaInterface?: SerenaInterface;
  exactMcpSelection?: boolean;
  exactSkillSelection?: boolean;
}

let localMcpEnv: Record<string, string> = {};
// Template `kaine-*` and project `<repoSlug>-*` outputs; stale ones are removed on install.
const isManagedName = managedNamePredicate();
// Set by --auto: git-tracked outputs belong to whoever changes the `.ai/` sources.
let trackedFiles: Set<string> | undefined;
const trackedDrift: string[] = [];

const usage = `Usage:
  pnpm ai:install [--agent claude|codex|cursor|opencode|grok] [--skill <name|all>] [--mcp <name|all>] [--non-interactive] [--prepare-serena] [--serena-interface tools|REPL]
  pnpm ai:install --auto

Without selection flags and on a TTY, prompts interactively.
Otherwise defaults to: --agent claude --agent codex. Skills and MCPs keep the recorded
selection for each agent; new default skills added to the team since then are installed too.
A first install uses all default skills and all default-eligible MCPs.
Claude and Codex launch Serena with the REPL interface unless --serena-interface tools
is recorded. REPL code runs outside the guarded-command hooks.

--auto refreshes every agent with a recorded selection, writes only untracked files, and
prints only what changed. The agent session hooks run it.
`;

const listTrackedFiles = (): Set<string> => {
  // Outside git nothing is tracked. Inside a checkout a git failure must stop --auto,
  // not let it treat tracked outputs as untracked and overwrite them.
  if (!existsSync(join(REPO_ROOT, ".git"))) return new Set();
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  return new Set(
    output
      .split("\0")
      .filter(Boolean)
      .map((file) => join(REPO_ROOT, file))
  );
};

/** Under --auto, names tracked files at or under `path` so cleanup keeps them. */
const keepTracked = (path: string): boolean => {
  const tracked = [...(trackedFiles ?? [])].filter(
    (file) => file === path || file.startsWith(`${path}${sep}`)
  );
  trackedDrift.push(...tracked.map((file) => relative(REPO_ROOT, file)));
  return tracked.length > 0;
};

const writeOutput = (file: string, content: string, results: WriteResult[]): void => {
  if (!trackedFiles?.has(file)) {
    writeGenerated(file, content, results);
    return;
  }
  if (!existsSync(file) || !generatedTextEqual(readFileSync(file, "utf8"), content)) {
    trackedDrift.push(relative(REPO_ROOT, file));
  }
};

/** Plain lines that a session hook passes on to the agent; nothing when all is current. */
const autoSummary = (agents: Agent[], results: WriteResult[], removed: string[]): string[] => {
  const changes = new Set<string>();
  for (const result of results.filter((entry) => entry.status !== "unchanged")) {
    const path = relative(REPO_ROOT, result.file);
    const skill = /skills[\\/]([^\\/]+)[\\/]SKILL\.md$/.exec(path)?.[1];
    changes.add(`${result.status === "created" ? "+" : "~"}${skill ?? path}`);
  }
  for (const entry of removed) changes.add(`-${entry.slice(entry.indexOf(": ") + 2)}`);
  const mcpConfigs = agents.map((agent) => join(REPO_ROOT, AGENT_REGISTRY[agent].mcpConfig.path));
  const changedMcp = results
    .filter((entry) => entry.status !== "unchanged" && mcpConfigs.includes(entry.file))
    .map((entry) => relative(REPO_ROOT, entry.file));
  const lines: string[] = [];
  if (changes.size > 0)
    lines.push(`AI setup refreshed (${agents.join(", ")}): ${[...changes].join(", ")}`);
  if (changedMcp.length > 0)
    lines.push(
      `MCP config changed (${changedMcp.join(", ")}): reconnect MCP servers or restart the session.`
    );
  if (trackedDrift.length > 0)
    lines.push(
      `Tracked AI files are out of date: ${[...new Set(trackedDrift)].join(", ")}. Run pnpm ai:install and commit.`
    );
  return lines;
};

const isAgent = (value: string): value is Agent => AGENTS.some((agent) => agent === value);

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
    options: AGENTS.map((agent) => ({
      value: agent,
      label: AGENT_REGISTRY[agent].label,
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
  try {
    return new Set(Object.keys(installedServers(agent, REPO_ROOT, true)));
  } catch {
    // A missing or unreadable config has no installed MCPs to preserve.
    return new Set();
  }
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
  let auto = false;
  let nonInteractive = false;
  let prepareSerena = false;
  let serenaInterface: SerenaInterface | undefined;

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
    if (arg === "--prepare-serena") {
      prepareSerena = true;
      continue;
    }
    if (arg === "--serena-interface") {
      const value = SERENA_INTERFACES.find((name) => name === args[index + 1]);
      if (!value) throw new Error(`--serena-interface requires ${SERENA_INTERFACES.join(" or ")}`);
      serenaInterface = value;
      index += 1;
      continue;
    }
    if (arg === "--non-interactive" || arg === "--no-interactive") {
      nonInteractive = true;
      continue;
    }
    if (arg === "--auto") {
      auto = true;
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
    auto,
    nonInteractive,
    prepareSerena,
    ...(serenaInterface ? { serenaInterface } : {})
  };
};

const selectSkills = (
  options: InstallOptions,
  allSkills: Skill[]
): { skills: Skill[]; requested: Skill[]; envSkipped: string[] } => {
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
  } else if (selected.size === 0 && !options.exactSkillSelection) {
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

  return { skills, requested: candidates, envSkipped };
};

const writeSharedOutputs = (allSkills: Skill[], results: WriteResult[]): void => {
  const guide = readGuideSource();
  writeOutput(join(REPO_ROOT, "AGENTS.md"), renderAgentDoc(guide, allSkills), results);
  writeOutput(join(REPO_ROOT, "CLAUDE.md"), renderClaudeImport(), results);

  if (existsSync(REVIEW_SRC)) {
    writeOutput(REVIEW_OUT, renderReviewDoc(readFileSync(REVIEW_SRC, "utf8")), results);
  }

  if (existsSync(SERENA_PROJECT_SRC)) {
    // Preserve Serena's schema migrations and local settings; apply only the seed-owned
    // keys and missing canonical workspace roots to existing projects.
    const serenaProjectPath = join(REPO_ROOT, ".serena", "project.yml");
    const seed = readFileSync(SERENA_PROJECT_SRC, "utf8");
    writeOutput(
      serenaProjectPath,
      existsSync(serenaProjectPath)
        ? mergeSerenaProjectSeed(seed, readFileSync(serenaProjectPath, "utf8"))
        : renderSerenaProject(seed),
      results
    );
  }

  if (existsSync(SERENA_MEMORIES_SRC_DIR)) {
    const seen = new Set<string>();
    for (const fileName of readdirSync(SERENA_MEMORIES_SRC_DIR).filter((file) =>
      file.endsWith(".md")
    )) {
      seen.add(fileName);
      writeOutput(
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
        if (keepTracked(filePath)) continue;
        rmSync(filePath, { force: true });
      }
    }
  }
};

const installAgent = (
  agent: Agent,
  skills: Skill[],
  requestedSkills: Skill[],
  agentDefinitions: AgentDefinition[],
  options: InstallOptions,
  mergedMcp: McpSource,
  personalMcpNames: Set<string>,
  managedMcps: string[],
  results: WriteResult[],
  removedSkills: string[],
  knownSkills: string[]
): string[] => {
  const skippedMcps: string[] = [];
  const facts = AGENT_REGISTRY[agent];
  const skillsDir = facts.skillDir;
  const expected = new Set(
    requestedSkills.filter((skill) => skill.agents.includes(agent)).map((skill) => skill.name)
  );

  for (const skill of skills) {
    if (!skill.agents.includes(agent)) {
      continue;
    }

    const file = join(REPO_ROOT, skillsDir, skill.name, "SKILL.md");
    writeOutput(file, facts.renderSkill(skill), results);
  }

  const dirAbs = join(REPO_ROOT, skillsDir);
  if (existsSync(dirAbs)) {
    for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isManagedName(entry.name) || expected.has(entry.name)) {
        continue;
      }

      if (keepTracked(join(dirAbs, entry.name))) continue;
      rmSync(join(dirAbs, entry.name), { recursive: true, force: true });
      removedSkills.push(`${agent}: ${entry.name}`);
    }
  }

  const resolved = resolveInstallMcpSource(mergedMcp, {
    agent,
    mcps: options.mcps,
    exactSelection: options.exactMcpSelection ?? false,
    personalNames: personalMcpNames,
    localEnv: localMcpEnv,
    ...(options.serenaInterface ? { serenaInterface: options.serenaInterface } : {})
  });
  skippedMcps.push(...resolved.skipped);

  const writeConfig = (file: string, content: string, output: WriteResult[]) => {
    const isConfig = file.endsWith(".json") || file.endsWith(".toml");
    const updated =
      isConfig && existsSync(file)
        ? mergeInstalledConfig(
            readFileSync(file, "utf8"),
            content,
            file.endsWith(".toml"),
            managedMcps,
            (message) => console.warn(chalk.yellow(`${relative(REPO_ROOT, file)}: ${message}`))
          )
        : content;
    writeOutput(file, updated, output);
  };
  const installAgentDefinitions = (
    agentsDirAbs: string,
    render: (definition: AgentDefinition) => string
  ) => {
    const expectedAgentDefs = new Set(agentDefinitions.map((definition) => definition.name));
    for (const definition of agentDefinitions) {
      writeOutput(join(agentsDirAbs, `${definition.name}.md`), render(definition), results);
    }

    if (existsSync(agentsDirAbs)) {
      for (const entry of readdirSync(agentsDirAbs, { withFileTypes: true })) {
        if (
          !entry.isFile() ||
          !entry.name.endsWith(".md") ||
          !isManagedName(entry.name.replace(/\.md$/, "")) ||
          expectedAgentDefs.has(entry.name.replace(/\.md$/, ""))
        ) {
          continue;
        }

        if (keepTracked(join(agentsDirAbs, entry.name))) continue;
        rmSync(join(agentsDirAbs, entry.name), { force: true });
        removedSkills.push(`${agent}: ${entry.name}`);
      }
    }
  };
  writeConfig(
    join(REPO_ROOT, facts.mcpConfig.path),
    facts.mcpConfig.render(resolved.source),
    results
  );
  for (const generated of facts.generatedFiles) {
    const content = generated.render();
    if (content !== undefined) writeConfig(join(REPO_ROOT, generated.path), content, results);
  }
  if (agent === "opencode") removeLegacyOpencodeGuardrail(REPO_ROOT);
  if (facts.agentDefinitions) {
    installAgentDefinitions(
      join(REPO_ROOT, facts.agentDefinitions.dir),
      facts.agentDefinitions.render
    );
  }

  writeInstallSelection(agent, {
    schemaVersion: 2,
    skills: [...expected],
    mcps: [...Object.keys(resolved.source.mcpServers), ...resolved.skipped],
    ownedMcps: Object.keys(resolved.source.mcpServers).filter((name) => managedMcps.includes(name)),
    knownSkills,
    ...(options.serenaInterface ? { serenaInterface: options.serenaInterface } : {})
  });
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
  } else if (options.auto) {
    // The first install is a person's choice; --auto only keeps recorded installs current.
    if (options.agents.length === 0)
      options.agents = AGENTS.filter((agent) => readInstallSelection(agent) !== null);
    if (options.agents.length === 0) return;
    trackedFiles = listTrackedFiles();
  } else if (options.agents.length === 0) {
    options.agents = ["claude", "codex"];
  }
  if (options.prepareSerena && !options.agents.includes("claude"))
    throw new Error("--prepare-serena requires --agent claude");

  const didCreateLocalMcpEnv = ensureLocalMcpEnv();
  localMcpEnv = readLocalMcpEnv();

  const allSkills = discoverSkills();
  const agentDefinitions = discoverAgentDefinitions();
  const teamMcp = readMcpSource();
  const personalMcp = readPersonalMcpSource();
  const merged = mergeMcpSources(teamMcp, personalMcp);
  const invalidMcps = validateMcpServers(merged.source);
  if (invalidMcps.length > 0) {
    throw new Error(`Invalid MCP server(s):\n${invalidMcps.join("\n")}`);
  }

  const mcpSelection = new Set(options.mcps);
  const knownMcps = new Set(Object.keys(merged.source.mcpServers));
  const unknownMcps = [...mcpSelection].filter((name) => name !== "all" && !knownMcps.has(name));
  if (unknownMcps.length > 0) {
    throw new Error(
      `Unknown MCP server(s): ${unknownMcps.join(", ")}\n\nAvailable: ${[...knownMcps].sort().join(", ")}, all`
    );
  }

  const { envSkipped } = selectSkills(options, allSkills);
  const results: WriteResult[] = [];
  const removedSkills: string[] = [];
  const skippedMcps = new Set<string>();

  writeSharedOutputs(allSkills, results);

  for (const agent of options.agents) {
    const previous = readInstallSelection(agent);
    const installedMcps = [...installedMcpsForAgent(agent)];
    const teamNames = Object.keys(teamMcp.mcpServers);
    const detectedMcps = installedMcps.filter((name) => teamNames.includes(name));
    const mcpChoice = chooseInstallSelection({
      explicit: options.mcps,
      recorded: previous?.mcps,
      detected: detectedMcps,
      defaults: teamNames.filter((name) => teamMcp.mcpServers[name]?.default !== false),
      interactive
    });
    if (previous?.schemaVersion !== 2) {
      const ambiguous = installedMcps.filter(
        (name) => !teamNames.includes(name) && !merged.personalNames.has(name)
      );
      if (ambiguous.length)
        console.log(
          chalk.yellow(
            `Preserved MCPs with unknown ownership: ${ambiguous.join(", ")}. Define personal entries in .ai.local/mcp.json.`
          )
        );
    }
    const skillDirectory = join(REPO_ROOT, AGENT_REGISTRY[agent].skillDir);
    const installedSkills = existsSync(skillDirectory)
      ? readdirSync(skillDirectory, { withFileTypes: true })
          .filter(
            (entry) =>
              entry.isDirectory() &&
              isManagedName(entry.name) &&
              allSkills.some((skill) => skill.name === entry.name)
          )
          .map((entry) => entry.name)
      : undefined;
    const defaultSkills = allSkills.filter((skill) => skill.isDefault).map((skill) => skill.name);
    const skillChoice = chooseInstallSelection({
      explicit: options.skills,
      recorded: previous?.skills,
      detected: installedSkills ?? [],
      defaults: defaultSkills
    });
    const addedSkills = options.skills.length
      ? []
      : newDefaultSkills(
          skillChoice.names,
          defaultSkills,
          previous?.schemaVersion === 2 ? previous.knownSkills : undefined
        );
    if (addedSkills.length && !options.auto)
      console.log(chalk.cyan(`${agent}: added new team skills: ${addedSkills.join(", ")}`));
    // A recorded skill the team has since retired drops out; an explicit unknown name still fails.
    const keptSkills = options.skills.length
      ? skillChoice.names
      : skillChoice.names.filter((name) => allSkills.some((skill) => skill.name === name));
    const agentOptions = {
      ...options,
      skills: [...keptSkills, ...addedSkills],
      exactSkillSelection: skillChoice.exact,
      mcps: mcpChoice.names,
      exactMcpSelection: mcpChoice.exact,
      serenaInterface: chooseSerenaInterface(options.serenaInterface, previous)
    };
    const { skills, requested, envSkipped: agentSkipped } = selectSkills(agentOptions, allSkills);
    envSkipped.push(...agentSkipped);
    for (const skipped of installAgent(
      agent,
      skills,
      requested,
      agentDefinitions,
      agentOptions,
      merged.source,
      merged.personalNames,
      managedMcpOwnership(previous, teamNames, merged.personalNames),
      results,
      removedSkills,
      allSkills.map((skill) => skill.name)
    )) {
      skippedMcps.add(skipped);
    }
  }

  if (options.auto) {
    for (const line of autoSummary(options.agents, results, removedSkills)) console.log(line);
    return;
  }

  if (!interactive) {
    console.log(chalk.cyan("🛠  Install AI assistant config"));
    console.log();
    console.log(chalk.bold("Agents"));
    console.log(chalk.gray(`  ${options.agents.join(", ")}`));
    console.log();
  }

  if (options.prepareSerena) {
    const server = installedServers("claude").serena;
    if (!server) throw new Error("Select and enable Serena before preparing its prompt");
    if (usesSerenaRepl(server)) {
      console.log("Skipped Serena prompt: it describes classic tools, and Claude uses the REPL.");
    } else {
      await prepareSerenaPrompt(REPO_ROOT, server);
      console.log("Prepared pinned Serena prompt for local startup.");
    }
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
