#!/usr/bin/env tsx

import chalk from "chalk";
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import {
  computeAgentDefinitionDrift,
  discoverAgentDefinitions,
  discoverSkills,
  lintAgentDefinitionsDir,
  lintDomainKnowledgeInfra,
  lintGuideSkillList,
  type LintIssue,
  lintSkillsDir,
  LOCAL_MCP_ENV_SRC,
  LOCAL_MCP_SRC,
  mergeMcpSources,
  readGuideSource,
  readLocalMcpEnv,
  readMcpSource,
  readPersonalMcpSource,
  REPO_ROOT,
  shouldFailDoctor
} from "./ai.util";
import { checkGuardContracts } from "./guard-check.util";
import {
  commandExists,
  envRequirements,
  installed,
  SKILL_DIRS,
  computeSkillDrift,
  computeSharedDrift,
  computeHookDrift
} from "./installation.util";
import { validateMcpPins } from "./mcp-probe.util";
import { runReadinessCommand } from "./readiness";
const printLintIssue = (issue: LintIssue): void => {
  const icon = issue.level === "error" ? chalk.red("✗") : chalk.yellow("⚠");
  console.log(`  ${icon}  ${chalk.gray(relative(REPO_ROOT, issue.file))}: ${issue.message}`);
};

const main = (): void => {
  const strict = process.argv.includes("--strict");
  const guardErrors = [...checkGuardContracts(), ...validateMcpPins(readMcpSource())];
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
  console.log(chalk.bold("Guard contracts (automated; not live agent verification)"));
  for (const error of guardErrors) console.log(`  ${chalk.red("✗")}  ${error}`);
  if (guardErrors.length === 0) console.log(`  ${chalk.green("✓")}  all five agent contracts pass`);
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

  if (
    shouldFailDoctor({
      lintErrorCount: lintErrors.length + guardErrors.length,
      strictDriftCount,
      strict
    })
  ) {
    if (lintErrors.length === 0 && guardErrors.length === 0) {
      console.log(
        chalk.red("✗ committed AI docs drifted and --strict is set (run: pnpm ai:install)")
      );
      console.log();
    }
    process.exitCode = 1;
  }
};

if (process.argv.some((arg) => ["--local", "--json", "--agent", "--probe-mcp"].includes(arg))) {
  void runReadinessCommand();
} else {
  main();
}
