import { existsSync, readdirSync, readFileSync } from "node:fs";
import { delimiter, isAbsolute, join, sep } from "node:path";

import {
  type Agent,
  generatedTextEqual,
  checkSerenaProjectSemantics,
  KAINE_PREFIX,
  mcpEnvValue,
  type McpServer,
  readGuideSource,
  REPO_ROOT,
  renderAgentDoc,
  renderClaudeImport,
  renderClaudeSettings,
  renderClaudeSkill,
  renderCodexSkill,
  renderCodexConfig,
  renderCursorSkill,
  renderCursorHooks,
  renderOpencodeGuardrailPlugin,
  renderGrokPreToolUseHook,
  renderGrokSessionStartHook,
  renderGrokSkill,
  renderOpencodeSkill,
  renderReviewDoc,
  renderSerenaMemory,
  REVIEW_OUT,
  REVIEW_SRC,
  SERENA_MEMORIES_SRC_DIR,
  SERENA_PROJECT_SRC,
  type Skill
} from "./ai.util";
import { managedConfigMatches } from "./install-config.util";
import { readInstallSelection } from "./install-state.util";

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

export const commandExists = (command: string | undefined): boolean => {
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

export const envRequirements = (
  server: McpServer,
  localEnv: Record<string, string>
): EnvRequirement[] => {
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

export const installed = (path: string): string =>
  existsSync(join(REPO_ROOT, path)) ? "yes" : "no";

export const SKILL_DIRS: ReadonlyArray<{
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

export const computeSkillDrift = (
  skills: Skill[],
  root = REPO_ROOT,
  onlyAgent?: Agent
): AgentDrift[] => {
  const drift: AgentDrift[] = [];

  for (const { agent, dir, render } of SKILL_DIRS) {
    if (onlyAgent && onlyAgent !== agent) continue;
    const dirAbs = join(root, dir);
    if (!existsSync(dirAbs)) {
      continue;
    }

    const selection = readInstallSelection(agent, root);
    const targeted = skills.filter(
      (skill) =>
        skill.agents.includes(agent) && (!selection || selection.skills.includes(skill.name))
    );
    const expectedNames = new Set(targeted.map((skill) => skill.name));
    const missing: string[] =
      selection?.skills.filter((name) => !skills.some((skill) => skill.name === name)) ?? [];
    const stale: string[] = [];

    for (const skill of targeted) {
      const filePath = join(dirAbs, skill.name, "SKILL.md");
      if (!existsSync(filePath)) {
        missing.push(skill.name);
        continue;
      }
      if (!generatedTextEqual(readFileSync(filePath, "utf8"), render(skill))) {
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

export const computeSharedDrift = (skills: Skill[]): FileDrift[] => {
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
      // Tracked: this file now carries the guarded-command policy, so drift is
      // a security regression rather than a local-setup nuisance.
      tracked: true
    }
  ];

  for (const file of expectedAgents) {
    if (!existsSync(file.path)) {
      drift.push({ label: file.label, status: "missing", tracked: file.tracked });
      continue;
    }
    if (
      !(file.label.endsWith(".json")
        ? managedConfigMatches(readFileSync(file.path, "utf8"), file.content)
        : generatedTextEqual(readFileSync(file.path, "utf8"), file.content))
    ) {
      drift.push({ label: file.label, status: "stale", tracked: file.tracked });
    }
  }

  if (existsSync(REVIEW_SRC)) {
    const content = renderReviewDoc(readFileSync(REVIEW_SRC, "utf8"));
    if (!existsSync(REVIEW_OUT)) {
      drift.push({ label: "REVIEW.md", status: "missing", tracked: true });
    } else if (!generatedTextEqual(readFileSync(REVIEW_OUT, "utf8"), content)) {
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
      } else if (!generatedTextEqual(readFileSync(filePath, "utf8"), content)) {
        drift.push({ label: `.serena/memories/${fileName}`, status: "stale", tracked: true });
      }
    }
  }

  return drift;
};

export const computeHookDrift = (): FileDrift[] => {
  const drift: FileDrift[] = [];
  for (const [directory, path, expected] of [
    [".cursor", ".cursor/hooks.json", renderCursorHooks()],
    [".opencode", ".opencode/plugins/kaine-guardrail.ts", renderOpencodeGuardrailPlugin()]
  ] as const) {
    if (!existsSync(join(REPO_ROOT, directory))) continue;
    const absolute = join(REPO_ROOT, path);
    if (!existsSync(absolute)) {
      drift.push({ label: path, status: "missing" });
    } else if (
      !(path.endsWith(".json")
        ? managedConfigMatches(readFileSync(absolute, "utf8"), expected)
        : generatedTextEqual(readFileSync(absolute, "utf8"), expected))
    ) {
      drift.push({ label: path, status: "stale" });
    }
  }
  const codexConfig = join(REPO_ROOT, ".codex", "config.toml");

  if (existsSync(codexConfig)) {
    const content = readFileSync(codexConfig, "utf8");
    if (
      !managedConfigMatches(content, renderCodexConfig({ mcpServers: {} }), true) ||
      content.includes("codex_hooks = true")
    ) {
      drift.push({ label: ".codex/config.toml hooks", status: "stale" });
    }
  }

  const grokInstalled =
    existsSync(join(REPO_ROOT, ".grok", "skills")) ||
    existsSync(join(REPO_ROOT, ".grok", "config.toml"));
  if (grokInstalled) {
    for (const hook of [
      { name: "kaine-session-start.json", content: renderGrokSessionStartHook() },
      { name: "kaine-pre-tool-use.json", content: renderGrokPreToolUseHook() }
    ]) {
      const hookPath = join(REPO_ROOT, ".grok", "hooks", hook.name);
      if (!existsSync(hookPath)) {
        drift.push({ label: `.grok/hooks/${hook.name}`, status: "missing" });
      } else if (!generatedTextEqual(readFileSync(hookPath, "utf8"), hook.content)) {
        drift.push({ label: `.grok/hooks/${hook.name}`, status: "stale" });
      }
    }
  }

  return drift;
};
