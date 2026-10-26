#!/usr/bin/env tsx

import chalk from "chalk";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { AGENT_REGISTRY } from "./agent-registry.util";
import {
  AGENTS,
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
  validateMcpServers,
  readPersonalMcpSource,
  REPO_ROOT,
  shouldFailDoctor
} from "./ai.util";
import { checkGuardContracts } from "./guard-check.util";
import {
  commandExists,
  envRequirements,
  installed,
  computeSkillDrift,
  computeSharedDrift,
  computeHookDrift
} from "./installation.util";
import { validateMcpPins } from "./mcp-probe.util";
import { runReadinessCommand } from "./readiness";
import {
  findConflictMarkers,
  listLocalSyncedFiles,
  parseSyncManifest,
  readLocalFiles,
  SYNC_MANIFEST_PATH
} from "./template-sync.util";

// Conflict markers that pnpm ai:sync left in synced files block the doctor until resolved.
const lintSyncConflicts = (): LintIssue[] => {
  const manifestFile = join(REPO_ROOT, SYNC_MANIFEST_PATH);
  if (!existsSync(manifestFile)) return [];
  const { paths } = parseSyncManifest(JSON.parse(readFileSync(manifestFile, "utf8")));
  return findConflictMarkers(readLocalFiles(REPO_ROOT, listLocalSyncedFiles(REPO_ROOT, paths))).map(
    (path) => ({
      file: join(REPO_ROOT, path),
      level: "error",
      message: "unresolved pnpm ai:sync conflict markers"
    })
  );
};

const printLintIssue = (issue: LintIssue): void => {
  const icon = issue.level === "error" ? chalk.red("✗") : chalk.yellow("⚠");
  console.log(`  ${icon}  ${chalk.gray(relative(REPO_ROOT, issue.file))}: ${issue.message}`);
};

const main = (): void => {
  const strict = process.argv.includes("--strict");
  const guardErrors = [
    ...checkGuardContracts(),
    ...validateMcpServers(readMcpSource()),
    ...validateMcpPins(readMcpSource())
  ];
  const lintIssues = [...lintSkillsDir(), ...lintAgentDefinitionsDir(), ...lintSyncConflicts()];
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
  const installs = AGENTS.flatMap((agent) => {
    const facts = AGENT_REGISTRY[agent];
    return [
      [`${facts.label} skills`, facts.skillDir],
      [`${facts.label} MCP config`, facts.mcpConfig.path],
      ...(facts.agentDefinitions
        ? [[`${facts.label} agents`, facts.agentDefinitions.dir] as const]
        : []),
      ...facts.generatedFiles.map((file) => [`${facts.label} ${file.path}`, file.path] as const)
    ] as const;
  });
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
    const commandOk = Boolean(server.url) || commandExists(server.command);
    const envOk = missing.length === 0;
    const allOk = commandOk && envOk;
    const icon = allOk ? chalk.green("✓") : chalk.yellow("⚠");
    const tag = merged.personalNames.has(name) ? chalk.gray(" [personal]") : "";
    const status = !commandOk
      ? chalk.red(`missing command: ${server.command ?? "unknown"}`)
      : !envOk
        ? chalk.yellow(`missing env: ${missing.map((item) => item.name).join(", ")}`)
        : chalk.gray(server.url ? "ok (remote)" : "ok");
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
    // Agent definitions count only for agents installed in this checkout.
    const agentDefinitionDrift = AGENTS.flatMap((agent) => {
      const { agentDefinitions: definitions, installMarkers } = AGENT_REGISTRY[agent];
      if (!definitions || !installMarkers.some((marker) => existsSync(join(REPO_ROOT, marker))))
        return [];
      return [
        {
          label: `${agent} agents`,
          drift: computeAgentDefinitionDrift(
            agentDefinitions,
            join(REPO_ROOT, definitions.dir),
            definitions.render
          ),
          orphanHint: `${definitions.dir}/<name>.md`
        }
      ];
    });
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

    const hasAgentDrift = agentDefinitionDrift.some(
      ({ drift }) => drift.missing.length > 0 || drift.stale.length > 0 || drift.orphan.length > 0
    );

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

      for (const { label, drift, orphanHint } of agentDefinitionDrift)
        reportAgentDrift(label, drift, orphanHint);
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
          const cleanupHint = AGENT_REGISTRY[entry.agent].skillDir;
          console.log(
            `  ${chalk.yellow("⚠")}  ${agentLabel}  orphan: ${entry.orphan.join(", ")}   ${chalk.gray(`(delete ${cleanupHint}/<name>/)`)}`
          );
        }
      }
    }
  }
  console.log();

  console.log(chalk.bold("Useful commands"));
  for (const agent of AGENTS) console.log(chalk.gray(`  pnpm ai:install --agent ${agent}`));
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
