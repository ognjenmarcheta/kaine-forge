#!/usr/bin/env tsx

import chalk from "chalk";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { delimiter, isAbsolute, join, relative, sep } from "node:path";

import {
  type Agent,
  checkSerenaProjectSemantics,
  computeAgentDefinitionDrift,
  discoverAgentDefinitions,
  discoverSkills,
  KAINE_PREFIX,
  lintAgentDefinitionsDir,
  lintDomainKnowledgeInfra,
  lintGuideSkillList,
  type LintIssue,
  lintSkillsDir,
  LOCAL_MCP_ENV_SRC,
  LOCAL_MCP_SRC,
  mcpEnvValue,
  type McpServer,
  mergeMcpSources,
  readGuideSource,
  readLocalMcpEnv,
  readMcpSource,
  readPersonalMcpSource,
  REPO_ROOT,
  renderAgentDoc,
  renderClaudeImport,
  renderClaudeSettings,
  renderClaudeSkill,
  renderCodexSkill,
  renderCursorSkill,
  renderGrokSessionStartHook,
  renderGrokSkill,
  renderOpencodeSkill,
  renderReviewDoc,
  renderSerenaMemory,
  REVIEW_OUT,
  REVIEW_SRC,
  SERENA_MEMORIES_SRC_DIR,
  SERENA_PROJECT_SRC,
  shouldFailDoctor,
  type Skill
} from "./ai.util";

interface EnvRequirement {
  name: string;
  hasFallback: boolean;
  isSet: boolean;
}

interface AgentDrift {
  agent: Agent;
  missing: string[];
  stale: string[];
  orphan: string[];
}

interface FileDrift {
  label: string;
  status: "missing" | "stale";
  // Committed artifacts fail --strict; local-install artifacts (absent in CI
  // checkouts) stay advisory.
  tracked?: boolean;
  hint?: string;
}

const commandExists = (command: string | undefined): boolean => {
  if (!command) {
    return false;
  }

  const extensions =
    process.platform === "win32"
      ? ["", ...(process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")]
      : [""];

  if (isAbsolute(command) || command.includes(sep)) {
    return extensions.some((ext) => existsSync(command + ext));
  }

  const paths = (process.env.PATH ?? "").split(delimiter).filter((dir) => dir.length > 0);
  return paths.some((dir) => extensions.some((ext) => existsSync(join(dir, command + ext))));
};

const envRequirements = (server: McpServer, localEnv: Record<string, string>): EnvRequirement[] => {
  const requirements: EnvRequirement[] = [];
  for (const value of Object.values(server.env ?? {})) {
    const match = value.match(/^\$\{([A-Z0-9_]+)(?::-(.*))?}$/);
    if (!match) {
      continue;
    }
    requirements.push({
      name: match[1]!,
      hasFallback: match[2] !== undefined,
      isSet: mcpEnvValue(match[1]!, localEnv) !== undefined
    });
  }
  return requirements;
};

const installed = (path: string): string => (existsSync(join(REPO_ROOT, path)) ? "yes" : "no");

const SKILL_DIRS: ReadonlyArray<{
  agent: Agent;
  dir: string;
  render: (skill: Skill) => string;
}> = [
  { agent: "claude", dir: ".claude/skills", render: renderClaudeSkill },
  { agent: "codex", dir: ".agents/skills", render: renderCodexSkill },
  { agent: "cursor", dir: ".cursor/skills", render: renderCursorSkill },
  { agent: "opencode", dir: ".opencode/skills", render: renderOpencodeSkill },
  { agent: "grok", dir: ".grok/skills", render: renderGrokSkill }
];

const computeSkillDrift = (skills: Skill[]): AgentDrift[] => {
  const drift: AgentDrift[] = [];

  for (const { agent, dir, render } of SKILL_DIRS) {
    const dirAbs = join(REPO_ROOT, dir);
    if (!existsSync(dirAbs)) {
      continue;
    }

    const targeted = skills.filter((skill) => skill.agents.includes(agent));
    const expectedNames = new Set(targeted.map((skill) => skill.name));
    const missing: string[] = [];
    const stale: string[] = [];

    for (const skill of targeted) {
      const filePath = join(dirAbs, skill.name, "SKILL.md");
      if (!existsSync(filePath)) {
        missing.push(skill.name);
        continue;
      }
      if (readFileSync(filePath, "utf8") !== render(skill)) {
        stale.push(skill.name);
      }
    }

    const orphan: string[] = [];
    for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
      if (
        !entry.isDirectory() ||
        !entry.name.startsWith(KAINE_PREFIX) ||
        expectedNames.has(entry.name)
      ) {
        continue;
      }
      const skillFile = join(dirAbs, entry.name, "SKILL.md");
      if (!existsSync(skillFile)) {
        continue;
      }
      orphan.push(entry.name);
    }

    if (missing.length > 0 || stale.length > 0 || orphan.length > 0) {
      drift.push({ agent, missing, stale, orphan });
    }
  }

  return drift;
};

const computeSharedDrift = (skills: Skill[]): FileDrift[] => {
  const drift: FileDrift[] = [];
  const expectedAgents = [
    {
      label: "AGENTS.md",
      path: join(REPO_ROOT, "AGENTS.md"),
      content: renderAgentDoc(readGuideSource(), skills),
      tracked: true
    },
    {
      label: "CLAUDE.md",
      path: join(REPO_ROOT, "CLAUDE.md"),
      content: renderClaudeImport(),
      tracked: true
    },
    {
      label: ".claude/settings.json",
      path: join(REPO_ROOT, ".claude", "settings.json"),
      content: renderClaudeSettings(),
      tracked: false
    }
  ];

  for (const file of expectedAgents) {
    if (!existsSync(file.path)) {
      drift.push({ label: file.label, status: "missing", tracked: file.tracked });
      continue;
    }
    if (readFileSync(file.path, "utf8") !== file.content) {
      drift.push({ label: file.label, status: "stale", tracked: file.tracked });
    }
  }

  if (existsSync(REVIEW_SRC)) {
    const content = renderReviewDoc(readFileSync(REVIEW_SRC, "utf8"));
    if (!existsSync(REVIEW_OUT)) {
      drift.push({ label: "REVIEW.md", status: "missing", tracked: true });
    } else if (readFileSync(REVIEW_OUT, "utf8") !== content) {
      drift.push({ label: "REVIEW.md", status: "stale", tracked: true });
    }
  }

  if (existsSync(SERENA_PROJECT_SRC)) {
    const filePath = join(REPO_ROOT, ".serena", "project.yml");
    // Serena rewrites this file in place (schema migrations), so a byte-exact
    // comparison against the seed self-inflicts permanent drift. The file is
    // gitignored and seeded once by ai:install; only its semantics are checked.
    if (!existsSync(filePath)) {
      drift.push({ label: ".serena/project.yml", status: "missing" });
    } else {
      for (const problem of checkSerenaProjectSemantics(
        readFileSync(SERENA_PROJECT_SRC, "utf8"),
        readFileSync(filePath, "utf8")
      )) {
        drift.push({
          label: ".serena/project.yml",
          status: "stale",
          hint: `${problem}; fix it, or delete the file and run pnpm ai:install`
        });
      }
    }
  }

  if (existsSync(SERENA_MEMORIES_SRC_DIR)) {
    for (const fileName of readdirSync(SERENA_MEMORIES_SRC_DIR).filter((file) =>
      file.endsWith(".md")
    )) {
      const filePath = join(REPO_ROOT, ".serena", "memories", fileName);
      const content = renderSerenaMemory(
        readFileSync(join(SERENA_MEMORIES_SRC_DIR, fileName), "utf8")
      );
      if (!existsSync(filePath)) {
        drift.push({ label: `.serena/memories/${fileName}`, status: "missing", tracked: true });
      } else if (readFileSync(filePath, "utf8") !== content) {
        drift.push({ label: `.serena/memories/${fileName}`, status: "stale", tracked: true });
      }
    }
  }

  return drift;
};

const computeHookDrift = (): FileDrift[] => {
  const drift: FileDrift[] = [];
  const codexConfig = join(REPO_ROOT, ".codex", "config.toml");

  if (existsSync(codexConfig)) {
    const content = readFileSync(codexConfig, "utf8");
    if (
      !content.includes("[[hooks.SessionStart]]") ||
      !content.includes(".ai/hooks/session-start.mjs") ||
      !content.includes("hooks = true") ||
      content.includes("codex_hooks = true")
    ) {
      drift.push({ label: ".codex/config.toml hooks", status: "stale" });
    }
  }

  const grokInstalled =
    existsSync(join(REPO_ROOT, ".grok", "skills")) ||
    existsSync(join(REPO_ROOT, ".grok", "config.toml"));
  if (grokInstalled) {
    const hookPath = join(REPO_ROOT, ".grok", "hooks", "kaine-session-start.json");
    const expected = renderGrokSessionStartHook();
    if (!existsSync(hookPath)) {
      drift.push({ label: ".grok/hooks/kaine-session-start.json", status: "missing" });
    } else if (readFileSync(hookPath, "utf8") !== expected) {
      drift.push({ label: ".grok/hooks/kaine-session-start.json", status: "stale" });
    }
  }

  return drift;
};

const printLintIssue = (issue: LintIssue): void => {
  const icon = issue.level === "error" ? chalk.red("✗") : chalk.yellow("⚠");
  console.log(`  ${icon}  ${chalk.gray(relative(REPO_ROOT, issue.file))}: ${issue.message}`);
};

const main = (): void => {
  const strict = process.argv.includes("--strict");
  const lintIssues = [...lintSkillsDir(), ...lintAgentDefinitionsDir()];
  let lintErrors = lintIssues.filter((issue) => issue.level === "error");
  const skills = lintErrors.length === 0 ? discoverSkills() : [];
  const agentDefinitions = lintErrors.length === 0 ? discoverAgentDefinitions() : [];

  if (lintErrors.length === 0) {
    lintIssues.push(
      ...lintGuideSkillList(
        readGuideSource(),
        skills.map((skill) => skill.name)
      ),
      ...lintDomainKnowledgeInfra()
    );
    lintErrors = lintIssues.filter((issue) => issue.level === "error");
  }
  const teamMcp = readMcpSource();
  const personalMcp = readPersonalMcpSource();
  const merged = mergeMcpSources(teamMcp, personalMcp);
  const localEnv = readLocalMcpEnv();

  const passIcon = (value: string): string =>
    value === "yes" ? chalk.green("✓") : chalk.gray("✗");

  console.log(chalk.cyan("🩺 AI tooling doctor"));
  console.log();

  console.log(chalk.bold("Shared docs"));
  console.log(`  ${passIcon(installed("AGENTS.md"))}  AGENTS.md`);
  console.log(`  ${passIcon(installed("CLAUDE.md"))}  CLAUDE.md`);
  console.log(`  ${passIcon(installed("REVIEW.md"))}  REVIEW.md`);
  console.log();

  console.log(chalk.bold("Canonical resources"));
  console.log(
    `  ${chalk.gray("Skills:")}           ${existsSync(join(REPO_ROOT, ".ai", "skills")) ? readdirSync(join(REPO_ROOT, ".ai", "skills")).filter((file) => file.endsWith(".md")).length : 0}`
  );
  console.log(`  ${chalk.gray("MCP servers:")}      ${Object.keys(teamMcp.mcpServers).length}`);
  console.log(`  ${chalk.gray("Personal MCPs:")}    ${merged.personalNames.size}`);
  console.log(
    `  ${chalk.gray("Local MCP env:")}    ${existsSync(LOCAL_MCP_ENV_SRC) ? chalk.green("yes") : chalk.gray("no")}`
  );
  console.log(
    `  ${chalk.gray("Local MCP src:")}    ${existsSync(LOCAL_MCP_SRC) ? chalk.green("yes") : chalk.gray("no")}`
  );
  console.log(
    `  ${chalk.gray("Serena project:")}   ${installed(".serena/project.yml") === "yes" ? chalk.green("yes") : chalk.gray("no")}`
  );
  console.log();

  console.log(chalk.bold("Local installs"));
  const installs: Array<readonly [string, string]> = [
    ["Claude skills", ".claude/skills"],
    ["Claude MCP", ".mcp.json"],
    ["Codex skills", ".agents/skills"],
    ["Codex MCP config", ".codex/config.toml"],
    ["Cursor skills", ".cursor/skills"],
    ["Cursor rules", ".cursor/rules"],
    ["OpenCode skills", ".opencode/skills"],
    ["OpenCode config", "opencode.json"],
    ["Grok skills", ".grok/skills"],
    ["Grok MCP config", ".grok/config.toml"],
    ["Grok session hook", ".grok/hooks/kaine-session-start.json"],
    ["Grok agents", ".grok/agents"]
  ];
  for (const [label, path] of installs) {
    if (installed(path) === "yes") {
      console.log(`  ${chalk.green("✓")}  ${label}`);
    } else {
      console.log(`  ${chalk.gray("–")}  ${label} ${chalk.gray("(not installed — optional)")}`);
    }
  }
  console.log();

  console.log(chalk.bold("MCP checks"));
  for (const [name, server] of Object.entries(merged.source.mcpServers)) {
    const requirements = envRequirements(server, localEnv);
    const missing = requirements.filter(
      (requirement) => !requirement.isSet && !requirement.hasFallback
    );
    const commandOk = commandExists(server.command);
    const envOk = missing.length === 0;
    const allOk = commandOk && envOk;
    const icon = allOk ? chalk.green("✓") : chalk.yellow("⚠");
    const tag = merged.personalNames.has(name) ? chalk.gray(" [personal]") : "";
    const status = !commandOk
      ? chalk.red(`missing command: ${server.command ?? "unknown"}`)
      : !envOk
        ? chalk.yellow(`missing env: ${missing.map((item) => item.name).join(", ")}`)
        : chalk.gray("ok");
    console.log(`  ${icon}  ${name.padEnd(18)}  ${status}${tag}`);
  }
  if (merged.collisions.length > 0) {
    console.log();
    console.log(
      chalk.yellow(
        `  ⚠ Personal MCP(s) shadowed by team source: ${[...merged.collisions].sort().join(", ")}`
      )
    );
  }
  console.log();

  console.log(chalk.bold("Skill lint"));
  if (lintIssues.length === 0) {
    console.log(`  ${chalk.green("✓")}  all skills valid`);
  } else {
    for (const issue of lintIssues) {
      printLintIssue(issue);
    }
  }
  console.log();

  console.log(chalk.bold("Drift"));
  let strictDriftCount = 0;
  if (lintErrors.length > 0) {
    console.log(`  ${chalk.gray("-")}  skipped (fix lint errors first)`);
  } else {
    const fileDrift = computeSharedDrift(skills);
    strictDriftCount = fileDrift.filter((entry) => entry.tracked).length;
    const skillDrift = computeSkillDrift(skills);
    const hookDrift = computeHookDrift();
    const claudeAgentDrift = computeAgentDefinitionDrift(
      agentDefinitions,
      join(REPO_ROOT, ".claude", "agents")
    );
    const grokAgentDrift = computeAgentDefinitionDrift(
      agentDefinitions,
      join(REPO_ROOT, ".grok", "agents")
    );
    const reportAgentDrift = (
      label: string,
      agentDrift: ReturnType<typeof computeAgentDefinitionDrift>,
      orphanHint: string
    ): boolean => {
      const hasDrift =
        agentDrift.missing.length > 0 ||
        agentDrift.stale.length > 0 ||
        agentDrift.orphan.length > 0;
      if (!hasDrift) {
        return false;
      }
      const padded = label.padEnd(28);
      if (agentDrift.stale.length > 0) {
        console.log(
          `  ${chalk.yellow("⚠")}  ${padded}  stale: ${agentDrift.stale.join(", ")}   ${chalk.gray("(run: pnpm ai:install)")}`
        );
      }
      if (agentDrift.missing.length > 0) {
        console.log(
          `  ${chalk.yellow("⚠")}  ${padded}  missing: ${agentDrift.missing.join(", ")}   ${chalk.gray("(run: pnpm ai:install)")}`
        );
      }
      if (agentDrift.orphan.length > 0) {
        console.log(
          `  ${chalk.yellow("⚠")}  ${padded}  orphan: ${agentDrift.orphan.join(", ")}   ${chalk.gray(`(delete ${orphanHint})`)}`
        );
      }
      return true;
    };

    const hasAgentDrift =
      claudeAgentDrift.missing.length > 0 ||
      claudeAgentDrift.stale.length > 0 ||
      claudeAgentDrift.orphan.length > 0 ||
      grokAgentDrift.missing.length > 0 ||
      grokAgentDrift.stale.length > 0 ||
      grokAgentDrift.orphan.length > 0;

    if (
      fileDrift.length === 0 &&
      skillDrift.length === 0 &&
      hookDrift.length === 0 &&
      !hasAgentDrift
    ) {
      console.log(`  ${chalk.green("✓")}  no drift detected`);
    } else {
      for (const entry of [...fileDrift, ...hookDrift]) {
        console.log(
          `  ${chalk.yellow("⚠")}  ${entry.label.padEnd(28)}  ${entry.status}   ${chalk.gray(`(${entry.hint ?? "run: pnpm ai:install"})`)}`
        );
      }

      reportAgentDrift("claude agents", claudeAgentDrift, ".claude/agents/<name>.md");
      // Only surface Grok agent drift when a Grok install tree is present.
      if (
        existsSync(join(REPO_ROOT, ".grok", "agents")) ||
        existsSync(join(REPO_ROOT, ".grok", "skills")) ||
        existsSync(join(REPO_ROOT, ".grok", "config.toml"))
      ) {
        reportAgentDrift("grok agents", grokAgentDrift, ".grok/agents/<name>.md");
      }
      // Local-install drift (skills, hooks, agents, settings) stays advisory:
      // those artifacts are gitignored and absent in CI checkouts. Under
      // --strict, drift in committed artifacts also gates the exit code below.

      for (const entry of skillDrift) {
        const agentLabel = entry.agent.padEnd(8);
        if (entry.stale.length > 0) {
          console.log(
            `  ${chalk.yellow("⚠")}  ${agentLabel}  stale: ${entry.stale.join(", ")}   ${chalk.gray("(run: pnpm ai:install)")}`
          );
        }
        if (entry.missing.length > 0) {
          console.log(
            `  ${chalk.yellow("⚠")}  ${agentLabel}  missing: ${entry.missing.join(", ")}   ${chalk.gray("(run: pnpm ai:install)")}`
          );
        }
        if (entry.orphan.length > 0) {
          const cleanupHint = SKILL_DIRS.find((dir) => dir.agent === entry.agent)?.dir;
          console.log(
            `  ${chalk.yellow("⚠")}  ${agentLabel}  orphan: ${entry.orphan.join(", ")}   ${chalk.gray(`(delete ${cleanupHint}/<name>/)`)}`
          );
        }
      }
    }
  }
  console.log();

  console.log(chalk.bold("Useful commands"));
  console.log(chalk.gray("  pnpm ai:install --agent claude"));
  console.log(chalk.gray("  pnpm ai:install --agent codex"));
  console.log(chalk.gray("  pnpm ai:install --agent cursor"));
  console.log(chalk.gray("  pnpm ai:install --agent opencode"));
  console.log(chalk.gray("  pnpm ai:install --agent grok"));
  console.log();

  console.log(
    chalk.gray(
      `Repository root: ${relative(process.env.INIT_CWD ?? process.cwd(), REPO_ROOT) || "."}`
    )
  );

  if (shouldFailDoctor({ lintErrorCount: lintErrors.length, strictDriftCount, strict })) {
    if (lintErrors.length === 0) {
      console.log(
        chalk.red("✗ committed AI docs drifted and --strict is set (run: pnpm ai:install)")
      );
      console.log();
    }
    process.exitCode = 1;
  }
};

main();
