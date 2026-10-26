import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { isScalar, isSeq, parse as parseYaml, parseDocument } from "yaml";

import {
  guardedCommandMessage,
  loadGuardedCommandRules,
  type GuardedCommandRule
} from "./hooks/guarded-command.mjs";
import { PROJECT_AI_PATH, readTemplateConfig, TEMPLATE_CONFIG_PATH } from "./template-sync.util";

export const generatedTextEqual = (actual: string, expected: string): boolean =>
  actual.replace(/\r\n/g, "\n") === expected.replace(/\r\n/g, "\n");

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const AI_DIR = join(REPO_ROOT, ".ai");
export const GUIDE_SRC = join(AI_DIR, "guide.md");
export const SKILLS_SRC_DIR = join(AI_DIR, "skills");
export const AGENTS_SRC_DIR = join(AI_DIR, "agents");
export const MCP_SRC = join(AI_DIR, "mcp.json");
export const PERMISSIONS_SRC = join(AI_DIR, "permissions.json");
export const MCP_ENV_EXAMPLE_SRC = join(AI_DIR, "mcp.env.example");
export const MCP_JSON_EXAMPLE_SRC = join(AI_DIR, "mcp.json.example");
export const CURSOR_RULES_SRC = join(AI_DIR, "cursor-rules.md");
export const SERENA_PROJECT_SRC = join(AI_DIR, "serena-project.yml");
export const SERENA_MEMORIES_SRC_DIR = join(AI_DIR, "serena-memories");
export const REVIEW_SRC = join(AI_DIR, "review.md");
export const REVIEW_OUT = join(REPO_ROOT, "REVIEW.md");
export const CONTEXT_OUT = join(REPO_ROOT, "CONTEXT.md");
export const DAY_ONE_DOC = join(REPO_ROOT, "docs", "agents", "day-one.md");
export const CONTRIBUTING_OUT = join(REPO_ROOT, "CONTRIBUTING.md");
export const LOCAL_MCP_ENV_SRC = join(REPO_ROOT, ".ai.local", "mcp.env");
export const LOCAL_MCP_SRC = join(REPO_ROOT, ".ai.local", "mcp.json");
export const PROJECT_AI_DIR = join(REPO_ROOT, PROJECT_AI_PATH);
export const PROJECT_GUIDE_SRC = join(PROJECT_AI_DIR, "guide.md");
export const PROJECT_REVIEW_SRC = join(PROJECT_AI_DIR, "review.md");
export const PROJECT_SKILLS_SRC_DIR = join(PROJECT_AI_DIR, "skills");
export const PROJECT_AGENTS_SRC_DIR = join(PROJECT_AI_DIR, "agents");
export const TEMPLATE_CONFIG_SRC = join(REPO_ROOT, TEMPLATE_CONFIG_PATH);

export const KAINE_PREFIX = "kaine-";
export const GEN_NOTICE = "GENERATED FILE. Do not edit directly. Run: pnpm ai:install";
export const HTML_HEADER = `<!-- ${GEN_NOTICE} -->`;
export const TOML_HEADER = `# ${GEN_NOTICE}`;

export const REVIEW_REQUIRED_HEADINGS = [
  "Correctness",
  "Security, Auth & Tenancy",
  "Architecture & Boundaries",
  "Data & GraphQL",
  "Performance",
  "UI & i18n",
  "Quality Gates",
  "Domain Language",
  "Template & AI Hygiene"
] as const;

export const CONTEXT_REQUIRED_HEADINGS = ["Language", "Relationships", "Example dialogue"] as const;

export const REQUIRED_SERENA_MEMORIES = [
  "core.md",
  "architecture_patterns.md",
  "coding_standards.md",
  "domain_overview.md",
  "environment_setup.md",
  "project_overview.md",
  "quality_expectations.md",
  "suggested_commands.md",
  "task_completion_checklist.md"
] as const;

export const DAY_ONE_CONTRIBUTING_MARKER = "Day-one agent ramp";

export const AGENTS = ["claude", "codex", "cursor", "opencode", "grok"] as const;
const EFFORT_LEVELS = ["low", "medium", "high"] as const;
const DESCRIPTION_SOFT_LIMIT = 1500;

export type Agent = (typeof AGENTS)[number];
/** Serena's `--agent-interface`: one MCP tool per operation, or Python through `serena_repl`. */
export const SERENA_INTERFACES = ["tools", "REPL"] as const;
export type SerenaInterface = (typeof SERENA_INTERFACES)[number];
export type Effort = (typeof EFFORT_LEVELS)[number];

export interface Skill {
  name: string;
  description: string;
  argumentHint: string;
  agents: Agent[];
  isDefault: boolean;
  requiresEnv: string[];
  model?: string;
  effort?: Effort;
  disableModelInvocation?: boolean;
  frontmatterRaw: string;
  body: string;
}

export interface AgentDefinition {
  name: string;
  description: string;
  /** Claude Code tool allowlist; absent means the agent inherits every tool. */
  tools?: string[];
  frontmatterRaw: string;
  body: string;
}

export interface AgentDefinitionDrift {
  missing: string[];
  stale: string[];
  orphan: string[];
}

export type GuardRule = GuardedCommandRule;

export interface McpServer {
  command?: string;
  /** Remote Streamable HTTP endpoint; set this or `command`, never both. */
  url?: string;
  args?: string[];
  env?: Record<string, string>;
  agents?: Agent[];
  default?: boolean;
}

export interface McpSource {
  mcpServers: Record<string, McpServer>;
}

export interface MergedMcpSource {
  source: McpSource;
  collisions: string[];
  personalNames: Set<string>;
}

export interface ResolveInstallMcpSourceOptions {
  agent: Agent;
  mcps: string[];
  exactSelection?: boolean;
  personalNames: Set<string>;
  localEnv: Record<string, string>;
  serenaInterface?: SerenaInterface;
}

export interface ResolvedInstallMcpSource {
  source: McpSource;
  skipped: string[];
}

export interface LintIssue {
  file: string;
  level: "error" | "warning";
  message: string;
}

export interface DomainKnowledgeLintInput {
  reviewContent: string | null;
  contextContent: string | null;
  skillNames: string[];
  kaineReviewBody: string | null;
  contributingContent: string | null;
  dayOneExists: boolean;
  serenaMemoryNames: string[];
  reviewFile?: string;
  contextFile?: string;
  contributingFile?: string;
  skillsDir?: string;
  dayOneFile?: string;
  serenaDir?: string;
}

export interface WriteResult {
  file: string;
  status: "created" | "unchanged" | "updated";
}

const isAgent = (value: unknown): value is Agent =>
  typeof value === "string" && AGENTS.some((agent) => agent === value);

const isEffort = (value: unknown): value is Effort =>
  typeof value === "string" && EFFORT_LEVELS.some((effort) => effort === value);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseAgentsField = (skillName: string, value: unknown): Agent[] => {
  if (value === undefined || value === null) {
    return [...AGENTS];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${skillName}: 'agents' must be a list`);
  }

  const agents: Agent[] = [];
  for (const agent of value) {
    if (!isAgent(agent)) {
      throw new Error(
        `${skillName}: unknown agent '${String(agent)}'. Allowed: ${AGENTS.join(", ")}.`
      );
    }
    agents.push(agent);
  }

  return agents;
};

const parseStringList = (skillName: string, field: string, value: unknown): string[] => {
  if (value === undefined || value === null) {
    return [];
  }

  const items: string[] = [];
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : null;

  if (!rawItems) {
    throw new Error(`${skillName}: '${field}' must be a string or list`);
  }

  for (const item of rawItems) {
    if (typeof item !== "string") {
      throw new Error(`${skillName}: '${field}' must be a list of strings`);
    }

    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    if (/\s/.test(trimmed)) {
      throw new Error(
        `${skillName}: '${field}' values must not contain whitespace (got '${trimmed}').`
      );
    }
    items.push(trimmed);
  }

  return items;
};

const splitFrontmatter = (
  name: string,
  content: string
): { frontmatterRaw: string; body: string; frontmatter: Record<string, unknown> } => {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!match) {
    throw new Error(`${name}: missing YAML frontmatter (expected '---\\n...\\n---\\n')`);
  }

  const frontmatterRaw = match[1]!;
  const body = match[2]!.replace(/^\n+/, "");

  let frontmatter: Record<string, unknown>;
  try {
    const parsed: unknown = parseYaml(frontmatterRaw) ?? {};
    // Non-mapping frontmatter falls through to {} so the field checks below
    // report the missing keys instead of a vague parse failure.
    frontmatter = isRecord(parsed) ? parsed : {};
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${name}: invalid YAML frontmatter: ${reason}`, { cause: error });
  }

  return { frontmatterRaw, body, frontmatter };
};

export const parseSkillFile = (name: string, content: string): Skill => {
  const { frontmatterRaw, body, frontmatter } = splitFrontmatter(name, content);

  if (typeof frontmatter.name !== "string") {
    throw new Error(`${name}: frontmatter missing 'name'`);
  }
  if (typeof frontmatter.description !== "string") {
    throw new Error(`${name}: frontmatter missing 'description'`);
  }
  if (frontmatter.name !== name) {
    throw new Error(`${name}: frontmatter 'name: ${frontmatter.name}' does not match file name`);
  }

  const argumentHint =
    typeof frontmatter["argument-hint"] === "string" ? frontmatter["argument-hint"] : "";
  const effortRaw = frontmatter.effort;

  if (effortRaw !== undefined && !isEffort(effortRaw)) {
    throw new Error(`${name}: 'effort' must be one of ${EFFORT_LEVELS.join(", ")}`);
  }

  const skill: Skill = {
    name: frontmatter.name,
    description: frontmatter.description,
    argumentHint,
    agents: parseAgentsField(name, frontmatter.agents),
    isDefault: frontmatter.default !== false,
    requiresEnv: parseStringList(name, "requires-env", frontmatter["requires-env"]),
    frontmatterRaw,
    body
  };

  if (typeof frontmatter.model === "string") {
    skill.model = frontmatter.model;
  }
  if (effortRaw !== undefined) {
    skill.effort = effortRaw;
  }
  if (frontmatter["disable-model-invocation"] === true) {
    skill.disableModelInvocation = true;
  }

  return skill;
};

/** Name prefix of project-owned skills and agents: `<repoSlug>-` from the adoption record. */
export const projectNamePrefix = (configFile: string = TEMPLATE_CONFIG_SRC): string | null => {
  const config = readTemplateConfig(configFile);
  return config ? `${config.adoption.repoSlug}-` : null;
};

/** Installed skill and agent names the installer owns, so it may remove stale ones. */
export const managedNamePredicate = (
  projectPrefix: string | null = projectNamePrefix()
): ((name: string) => boolean) => {
  return (name) =>
    name.startsWith(KAINE_PREFIX) || (projectPrefix !== null && name.startsWith(projectPrefix));
};

/** A canonical source folder and the prefix its names need; null means no adoption record. */
export interface CanonicalSourceDir {
  dir: string;
  prefix: string | null;
}

const canonicalSourceDirs = (templateDir: string, projectDir: string): CanonicalSourceDir[] => [
  { dir: templateDir, prefix: KAINE_PREFIX },
  ...(existsSync(projectDir) ? [{ dir: projectDir, prefix: projectNamePrefix() }] : [])
];

export const skillSourceDirs = (): CanonicalSourceDir[] =>
  canonicalSourceDirs(SKILLS_SRC_DIR, PROJECT_SKILLS_SRC_DIR);

export const agentSourceDirs = (): CanonicalSourceDir[] =>
  canonicalSourceDirs(AGENTS_SRC_DIR, PROJECT_AGENTS_SRC_DIR);

const markdownFileNames = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name)
    : [];

const missingProjectPrefix = (dir: string): string =>
  `${relative(REPO_ROOT, dir)}: project sources need ${TEMPLATE_CONFIG_PATH} (run pnpm template:adopt --write or pnpm ai:sync --init) to set their name prefix`;

export const discoverSkills = (
  sources: readonly CanonicalSourceDir[] = skillSourceDirs()
): Skill[] => {
  const skills: Skill[] = [];

  for (const { dir, prefix } of sources) {
    for (const fileName of markdownFileNames(dir)) {
      if (prefix === null) {
        throw new Error(missingProjectPrefix(dir));
      }

      const name = fileName.replace(/\.md$/, "");
      const skill = parseSkillFile(name, readFileSync(join(dir, fileName), "utf8"));

      if (!skill.name.startsWith(prefix)) {
        throw new Error(`${name}: canonical skill names must start with '${prefix}'`);
      }

      skills.push(skill);
    }
  }

  return [...skills].sort((left, right) => left.name.localeCompare(right.name));
};

export const lintSkillsDir = (
  sources: readonly CanonicalSourceDir[] = skillSourceDirs()
): LintIssue[] => {
  const issues: LintIssue[] = [];

  for (const { dir, prefix } of sources) {
    const fileNames = markdownFileNames(dir);
    if (prefix === null) {
      if (fileNames.length > 0) {
        issues.push({ file: dir, level: "error", message: missingProjectPrefix(dir) });
      }
      continue;
    }

    for (const fileName of fileNames) {
      const name = fileName.replace(/\.md$/, "");
      const file = join(dir, fileName);

      try {
        const skill = parseSkillFile(name, readFileSync(file, "utf8"));
        if (!skill.name.startsWith(prefix)) {
          issues.push({
            file,
            level: "error",
            message: `name '${skill.name}' must start with '${prefix}'`
          });
        }
        if (skill.description.length > DESCRIPTION_SOFT_LIMIT) {
          issues.push({
            file,
            level: "warning",
            message: `description is ${skill.description.length} chars; Claude truncates skill listings at 1536`
          });
        }
        if (skill.body.trim().length === 0) {
          issues.push({ file, level: "error", message: "body is empty" });
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        issues.push({ file, level: "error", message: reason });
      }
    }
  }

  return issues;
};

export const parseAgentDefinitionFile = (name: string, content: string): AgentDefinition => {
  const { frontmatterRaw, body, frontmatter } = splitFrontmatter(name, content);

  if (typeof frontmatter.name !== "string") {
    throw new Error(`${name}: frontmatter missing 'name'`);
  }
  if (typeof frontmatter.description !== "string") {
    throw new Error(`${name}: frontmatter missing 'description'`);
  }
  if (frontmatter.name !== name) {
    throw new Error(`${name}: frontmatter 'name: ${frontmatter.name}' does not match file name`);
  }
  if (body.trim().length === 0) {
    throw new Error(`${name}: body is empty`);
  }

  const tools =
    typeof frontmatter.tools === "string"
      ? frontmatter.tools
          .split(",")
          .map((tool) => tool.trim())
          .filter(Boolean)
      : undefined;

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    ...(tools ? { tools } : {}),
    frontmatterRaw,
    body
  };
};

export const discoverAgentDefinitions = (
  sources: readonly CanonicalSourceDir[] = agentSourceDirs()
): AgentDefinition[] => {
  const definitions: AgentDefinition[] = [];

  for (const { dir, prefix } of sources) {
    for (const fileName of markdownFileNames(dir)) {
      if (prefix === null) {
        throw new Error(missingProjectPrefix(dir));
      }

      const name = fileName.replace(/\.md$/, "");
      const definition = parseAgentDefinitionFile(name, readFileSync(join(dir, fileName), "utf8"));

      if (!definition.name.startsWith(prefix)) {
        throw new Error(`${name}: canonical agent definition names must start with '${prefix}'`);
      }

      definitions.push(definition);
    }
  }

  return [...definitions].sort((left, right) => left.name.localeCompare(right.name));
};

export const lintAgentDefinitionsDir = (
  sources: readonly CanonicalSourceDir[] = agentSourceDirs()
): LintIssue[] => {
  const issues: LintIssue[] = [];

  for (const { dir, prefix } of sources) {
    const fileNames = markdownFileNames(dir);
    if (prefix === null) {
      if (fileNames.length > 0) {
        issues.push({ file: dir, level: "error", message: missingProjectPrefix(dir) });
      }
      continue;
    }

    for (const fileName of fileNames) {
      const name = fileName.replace(/\.md$/, "");
      const file = join(dir, fileName);

      try {
        const definition = parseAgentDefinitionFile(name, readFileSync(file, "utf8"));
        if (!definition.name.startsWith(prefix)) {
          issues.push({
            file,
            level: "error",
            message: `name '${definition.name}' must start with '${prefix}'`
          });
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        issues.push({ file, level: "error", message: reason });
      }
    }
  }

  return issues;
};

export const computeAgentDefinitionDrift = (
  definitions: AgentDefinition[],
  dir: string,
  render: (definition: AgentDefinition) => string = renderClaudeAgentDefinition
): AgentDefinitionDrift => {
  const expectedNames = new Set(definitions.map((definition) => definition.name));
  const missing: string[] = [];
  const stale: string[] = [];
  const orphan: string[] = [];

  if (!existsSync(dir)) {
    return { missing, stale, orphan };
  }

  for (const definition of definitions) {
    const filePath = join(dir, `${definition.name}.md`);
    if (!existsSync(filePath)) {
      missing.push(definition.name);
      continue;
    }
    if (!generatedTextEqual(readFileSync(filePath, "utf8"), render(definition))) {
      stale.push(definition.name);
    }
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    const entryName = entry.name.replace(/\.md$/, "");
    if (!entryName.startsWith(KAINE_PREFIX) || expectedNames.has(entryName)) {
      continue;
    }
    orphan.push(entryName);
  }

  return { missing, stale, orphan };
};

export const GUIDE_SKILL_INDEX_MARKER = "<!-- kaine:skills-index -->";

export const lintReviewSource = (
  content: string | null,
  file: string = REVIEW_SRC
): LintIssue[] => {
  if (content === null) {
    return [{ file, level: "error", message: "missing .ai/review.md (canonical REVIEW source)" }];
  }
  const issues: LintIssue[] = [];
  for (const heading of REVIEW_REQUIRED_HEADINGS) {
    const needle = `## ${heading}`;
    if (!content.includes(needle)) {
      issues.push({
        file,
        level: "error",
        message: `review source missing required heading '${needle}'`
      });
    }
  }
  return issues;
};

export const lintContextSource = (
  content: string | null,
  file: string = CONTEXT_OUT
): LintIssue[] => {
  if (content === null) {
    return [{ file, level: "error", message: "missing CONTEXT.md" }];
  }
  const issues: LintIssue[] = [];
  for (const heading of CONTEXT_REQUIRED_HEADINGS) {
    const needle = `## ${heading}`;
    if (!content.includes(needle)) {
      issues.push({
        file,
        level: "error",
        message: `CONTEXT.md missing required heading '${needle}'`
      });
    }
  }
  return issues;
};

export const lintDomainKnowledgeArtifacts = (input: DomainKnowledgeLintInput): LintIssue[] => {
  const reviewFile = input.reviewFile ?? REVIEW_SRC;
  const contextFile = input.contextFile ?? CONTEXT_OUT;
  const contributingFile = input.contributingFile ?? CONTRIBUTING_OUT;
  const skillsDir = input.skillsDir ?? SKILLS_SRC_DIR;
  const dayOneFile = input.dayOneFile ?? DAY_ONE_DOC;
  const serenaDir = input.serenaDir ?? SERENA_MEMORIES_SRC_DIR;

  const issues: LintIssue[] = [
    ...lintReviewSource(input.reviewContent, reviewFile),
    ...lintContextSource(input.contextContent, contextFile)
  ];

  if (!input.skillNames.includes("kaine-encode-knowledge")) {
    issues.push({
      file: skillsDir,
      level: "error",
      message: "skill 'kaine-encode-knowledge' is missing from .ai/skills"
    });
  }

  if (input.kaineReviewBody === null) {
    issues.push({
      file: join(skillsDir, "kaine-review.md"),
      level: "error",
      message: "skill 'kaine-review' is missing"
    });
  } else if (
    !/REVIEW\.md/i.test(input.kaineReviewBody) &&
    !/\.ai\/review\.md/i.test(input.kaineReviewBody)
  ) {
    issues.push({
      file: join(skillsDir, "kaine-review.md"),
      level: "error",
      message: "kaine-review must reference REVIEW.md or .ai/review.md checklist"
    });
  }

  if (!input.dayOneExists) {
    issues.push({
      file: dayOneFile,
      level: "error",
      message: "missing docs/agents/day-one.md"
    });
  }

  if (input.contributingContent === null) {
    issues.push({
      file: contributingFile,
      level: "error",
      message: "missing CONTRIBUTING.md"
    });
  } else if (!input.contributingContent.includes(DAY_ONE_CONTRIBUTING_MARKER)) {
    issues.push({
      file: contributingFile,
      level: "error",
      message: `CONTRIBUTING.md missing '${DAY_ONE_CONTRIBUTING_MARKER}' section`
    });
  }

  const presentMemories = new Set(input.serenaMemoryNames);
  for (const name of REQUIRED_SERENA_MEMORIES) {
    if (!presentMemories.has(name)) {
      issues.push({
        file: serenaDir,
        level: "error",
        message: `required Serena memory missing: ${name}`
      });
    }
  }

  return issues;
};

/** Disk-backed entry point used by ai:doctor */
export const lintDomainKnowledgeInfra = (): LintIssue[] => {
  const reviewContent = existsSync(REVIEW_SRC) ? readFileSync(REVIEW_SRC, "utf8") : null;
  const contextContent = existsSync(CONTEXT_OUT) ? readFileSync(CONTEXT_OUT, "utf8") : null;
  const contributingContent = existsSync(CONTRIBUTING_OUT)
    ? readFileSync(CONTRIBUTING_OUT, "utf8")
    : null;

  let skillNames: string[] = [];
  let kaineReviewBody: string | null = null;
  try {
    const skills = discoverSkills();
    skillNames = skills.map((s) => s.name);
    const reviewSkill = skills.find((s) => s.name === "kaine-review");
    kaineReviewBody = reviewSkill?.body ?? null;
  } catch {
    // discoverSkills throws on parse errors; skill dir lint already reports those
    skillNames = [];
    kaineReviewBody = null;
  }

  // If kaine-review failed parse, still try raw file for reference check
  const reviewSkillPath = join(SKILLS_SRC_DIR, "kaine-review.md");
  if (kaineReviewBody === null && existsSync(reviewSkillPath)) {
    kaineReviewBody = readFileSync(reviewSkillPath, "utf8");
  }

  const serenaMemoryNames = existsSync(SERENA_MEMORIES_SRC_DIR)
    ? readdirSync(SERENA_MEMORIES_SRC_DIR).filter((f) => f.endsWith(".md"))
    : [];

  return lintDomainKnowledgeArtifacts({
    reviewContent,
    contextContent,
    skillNames,
    kaineReviewBody,
    contributingContent,
    dayOneExists: existsSync(DAY_ONE_DOC),
    serenaMemoryNames
  });
};

export const lintGuideSkillList = (guideContent: string, skillNames: string[]): LintIssue[] => {
  const issues: LintIssue[] = [];
  if (guideContent.split(GUIDE_SKILL_INDEX_MARKER).length !== 2)
    issues.push({
      file: GUIDE_SRC,
      level: "error",
      message: "guide must contain exactly one generated skill index marker"
    });
  if (
    /^- `kaine-[a-z0-9-]+`:/m.test(guideContent) ||
    guideContent.includes("## Generated Skills Index")
  )
    issues.push({
      file: GUIDE_SRC,
      level: "error",
      message: "guide must not contain a second or manually maintained skill index"
    });
  if (new Set(skillNames).size !== skillNames.length)
    issues.push({ file: GUIDE_SRC, level: "error", message: "skill names must be unique" });
  return issues;
};

export const readGuideSource = (): string => readFileSync(GUIDE_SRC, "utf8");

// SAFETY: .ai/mcp.json is the repo-tracked canonical MCP config, maintained by the
// team in McpSource shape; every McpServer field is optional, so a malformed entry
// surfaces as absent fields downstream, not unsound access.
export const readMcpSource = (): McpSource =>
  JSON.parse(readFileSync(MCP_SRC, "utf8")) as McpSource;

/** Each server launches a local `command` or reaches a remote `url`; a remote URL uses TLS. */
export const validateMcpServers = (source: McpSource): string[] => {
  const problems: string[] = [];
  for (const [name, server] of Object.entries(source.mcpServers)) {
    if (Boolean(server.command) === Boolean(server.url))
      problems.push(`${name}: set exactly one of command or url`);
    if (server.url && !server.url.startsWith("https://"))
      problems.push(`${name}: use an https:// url`);
  }
  return problems;
};

/**
 * The well-formed rules of the guarded-command policy, through the loader the
 * hook uses. pnpm ai:doctor reports any rule this drops.
 */
export const readPermissionsSource = (): GuardRule[] => loadGuardedCommandRules(PERMISSIONS_SRC);

/**
 * Claude permission strings for the rules its matcher can express. Rules
 * carrying a `flag` emit nothing: Bash permission rules match command text
 * linearly and cannot constrain a flag by name, so those are hook-only. pnpm
 * script names contain colons, which makes the `:*` wildcard ambiguous, so the
 * exact and trailing-argument forms are emitted as a pair instead.
 */
export const claudePermissionEntries = (rules: GuardRule[]): { ask: string[]; deny: string[] } => {
  const entriesFor = (decision: GuardRule["decision"]): string[] =>
    rules
      .filter((rule) => rule.decision === decision && rule.flag === undefined)
      .flatMap((rule) => [`Bash(${rule.command})`, `Bash(${rule.command} *)`]);

  return { ask: entriesFor("ask"), deny: entriesFor("deny") };
};

/**
 * OpenCode `permission.bash` globs for the same command-only rules. OpenCode
 * matches parsed commands with `*` wildcards and lets the last matching rule
 * win, so the exact/trailing pair mirrors the Claude form and no catch-all is
 * emitted. Flag rules stay with the guardrail plugin.
 * Contract: https://opencode.ai/docs/permissions/
 */
export const opencodePermissionEntries = (
  rules: GuardRule[]
): Record<string, GuardRule["decision"]> =>
  Object.fromEntries(
    rules
      .filter((rule) => rule.flag === undefined)
      .flatMap((rule) => [
        [rule.command, rule.decision],
        [`${rule.command} *`, rule.decision]
      ])
  );

/**
 * The human-readable half of the policy. Reaches every agent through AGENTS.md,
 * including the ones whose config carries no permissions primitive, and cannot
 * drift from the enforced half because pnpm ai:doctor --strict gates AGENTS.md.
 */
export const renderGuardedCommandsSection = (rules: GuardRule[]): string => {
  // A bullet list, not a table: prettier realigns markdown tables, so a
  // generated table would drift from its committed form on every commit. The
  // Generated Skills Index above uses bullets for the same reason.
  const rows = rules.map((rule) => {
    const target = rule.flag ? `${rule.command} ... ${rule.flag}` : rule.command;
    return `- **${rule.decision}** \`${target}\` — ${guardedCommandMessage(rule)}`;
  });

  return [
    "## Guarded Commands",
    "",
    "The hook `.ai/hooks/pre-tool-use.mjs` applies `.ai/permissions.json` to supported",
    "literal command forms. `deny` blocks matched calls on agents that honour the hook.",
    "`ask` is a real verdict on Claude, Cursor, and OpenCode (OpenCode: rules without a",
    "flag) and degrades to an advisory elsewhere.",
    "Hooks are guardrails, not a complete security boundary. Supported syntax and",
    "failure behavior are documented in `docs/agents/agent-engineering.md`.",
    "",
    ...rows
  ].join("\n");
};

export const readPersonalMcpSource = (): McpSource => {
  if (!existsSync(LOCAL_MCP_SRC)) {
    return { mcpServers: {} };
  }

  // SAFETY: Partial keeps both top-level keys optional, so the assertion trusts the
  // gitignored file for nothing beyond object shape; the ?? fallbacks below cover
  // files that omit either key.
  const parsed = JSON.parse(readFileSync(LOCAL_MCP_SRC, "utf8")) as Partial<
    McpSource & { mcp: McpSource["mcpServers"] }
  >;

  return {
    mcpServers: parsed.mcpServers ?? parsed.mcp ?? {}
  };
};

export const mergeMcpSources = (team: McpSource, personal: McpSource): MergedMcpSource => {
  const mcpServers: Record<string, McpServer> = { ...team.mcpServers };
  const collisions: string[] = [];
  const personalNames = new Set<string>();

  for (const [name, server] of Object.entries(personal.mcpServers)) {
    if (name in team.mcpServers) {
      collisions.push(name);
      continue;
    }
    mcpServers[name] = server;
    personalNames.add(name);
  }

  return { source: { mcpServers }, collisions, personalNames };
};

export const ensureLocalMcpEnv = (): boolean => {
  if (existsSync(LOCAL_MCP_ENV_SRC) || !existsSync(MCP_ENV_EXAMPLE_SRC)) {
    return false;
  }

  mkdirSync(dirname(LOCAL_MCP_ENV_SRC), { recursive: true });
  writeFileSync(LOCAL_MCP_ENV_SRC, readFileSync(MCP_ENV_EXAMPLE_SRC, "utf8"));
  return true;
};

export const readLocalMcpEnv = (): Record<string, string> => {
  if (!existsSync(LOCAL_MCP_ENV_SRC)) {
    return {};
  }

  const env: Record<string, string> = {};
  for (const rawLine of readFileSync(LOCAL_MCP_ENV_SRC, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    env[match[1]!] = match[2]!.trim().replace(/^['"]|['"]$/g, "");
  }

  return env;
};

export const mcpEnvValue = (name: string, localEnv: Record<string, string>): string | undefined => {
  const value = process.env[name] ?? localEnv[name];
  return value || undefined;
};

const buildSkillsIndex = (skills: Skill[]): string =>
  skills.map((skill) => `- \`${skill.name}\`: ${skill.description}`).join("\n");

const readOptionalSource = (file: string): string | null =>
  existsSync(file) ? readFileSync(file, "utf8") : null;

/** Puts project-owned text after the upstream text; upstream output is unchanged without it. */
const appendProjectSource = (source: string, projectSource: string | null): string =>
  projectSource?.trim() ? `${source.trim()}\n\n${projectSource.trim()}` : source.trim();

export const renderAgentDoc = (
  guide: string,
  skills: Skill[],
  projectGuide: string | null = readOptionalSource(PROJECT_GUIDE_SRC)
): string => {
  const issues = lintGuideSkillList(
    guide,
    skills.map((skill) => skill.name)
  );
  if (issues.length) throw new Error(issues.map((issue) => issue.message).join("; "));
  const body = appendProjectSource(
    guide.trim().replace(GUIDE_SKILL_INDEX_MARKER, buildSkillsIndex(skills)),
    projectGuide
  );
  return `${body}\n\n${renderGuardedCommandsSection(readPermissionsSource())}\n`;
};

export const renderClaudeImport = (): string => "@AGENTS.md\n";

const AI_CONTEXT_HOOK_COMMAND =
  'node "$(git rev-parse --show-toplevel)/.ai/hooks/session-start.mjs"';

const PRE_TOOL_USE_HOOK_COMMAND =
  'node "$(git rev-parse --show-toplevel)/.ai/hooks/pre-tool-use.mjs"';

/** Short: the hook only reads and matches against a small JSON file. */
const PRE_TOOL_USE_TIMEOUT_SECONDS = 10;

/**
 * Read-only MCP tools that skip the permission prompt. Serena's REPL interface exposes only
 * `initial_instructions`; the other names cover `--serena-interface tools`. Browser tools and
 * `serena_repl` stay prompted because they reach external sites or run code. GitButler's
 * `gitbutler_mark_review_ready` stays prompted because it changes a pull request.
 */
const CLAUDE_MCP_READ_ALLOW = [
  ...["resolve-library-id", "query-docs"].map((tool) => `mcp__context7__${tool}`),
  ...["search_docs", "get_doc"].map((tool) => `mcp__better-auth__${tool}`),
  ...[
    "gitbutler_workspace",
    "gitbutler_branch_details",
    "gitbutler_commit_details",
    "gitbutler_review_card",
    "gitbutler_refresh_reviews"
  ].map((tool) => `mcp__gitbutler__${tool}`),
  ...[
    "initial_instructions",
    "find_symbol",
    "find_referencing_symbols",
    "get_symbols_overview",
    "search_for_pattern",
    "list_dir",
    "find_file",
    "find_declaration",
    "find_implementations",
    "get_diagnostics_for_file",
    "list_memories",
    "read_memory",
    "get_current_config"
  ].map((tool) => `mcp__serena__${tool}`)
];

export const renderClaudeSettings = (): string => {
  const permissions = claudePermissionEntries(readPermissionsSource());

  return `${JSON.stringify(
    {
      // deny is evaluated before allow and rules merge across settings files by
      // type, so these survive a broader allow in an untracked
      // .claude/settings.local.json.
      permissions: { allow: CLAUDE_MCP_READ_ALLOW, ask: permissions.ask, deny: permissions.deny },
      hooks: {
        PreToolUse: [
          {
            matcher: "^(Bash|PowerShell)$",
            hooks: [
              {
                type: "command",
                command: `${PRE_TOOL_USE_HOOK_COMMAND} --agent claude`,
                timeout: PRE_TOOL_USE_TIMEOUT_SECONDS
              }
            ]
          }
        ],
        SessionStart: [
          {
            matcher: "startup|resume",
            hooks: [
              {
                type: "command",
                command: `${AI_CONTEXT_HOOK_COMMAND} --agent claude`,
                statusMessage: "Loading Kaine Forge AI context"
              }
            ]
          }
        ]
      }
    },
    null,
    2
  )}\n`;
};

export const renderClaudeSkill = (skill: Skill): string =>
  `---\n${skill.frontmatterRaw}\n---\n${HTML_HEADER}\n\n${skill.body}`;

export const renderClaudeAgentDefinition = (definition: AgentDefinition): string => {
  const body = definition.body.endsWith("\n") ? definition.body : `${definition.body}\n`;
  return `---\n${definition.frontmatterRaw}\n---\n${body}`;
};

export const renderCodexSkill = renderClaudeSkill;
export const renderCursorSkill = renderClaudeSkill;
export const renderGrokSkill = renderClaudeSkill;
export const renderGrokAgentDefinition = renderClaudeAgentDefinition;

/** Claude tool names that unlock each OpenCode permission an allowlist can deny. */
const OPENCODE_AGENT_PERMISSION_TOOLS = {
  edit: ["Edit", "Write", "NotebookEdit"],
  bash: ["Bash"],
  webfetch: ["WebFetch"],
  websearch: ["WebSearch"],
  task: ["Agent", "Task"]
} as const;

/**
 * OpenCode agents take `mode` and `permission` instead of Claude's `model`
 * and `tools`. Omitting `model` makes a subagent use its caller's model,
 * which matches `model: inherit`. Contract: https://opencode.ai/docs/agents/
 */
export const renderOpencodeAgentDefinition = (definition: AgentDefinition): string => {
  const { tools } = definition;
  const denied = tools
    ? Object.entries(OPENCODE_AGENT_PERMISSION_TOOLS)
        .filter(([, unlocking]) => !unlocking.some((tool) => tools.includes(tool)))
        .map(([permission]) => `  ${permission}: deny`)
    : [];
  const frontmatter = [
    `description: ${JSON.stringify(definition.description)}`,
    "mode: subagent",
    ...(denied.length > 0 ? ["permission:", ...denied] : [])
  ];
  const body = definition.body.endsWith("\n") ? definition.body : `${definition.body}\n`;
  return `---\n${frontmatter.join("\n")}\n---\n${body}`;
};

export const renderOpencodeSkill = (skill: Skill): string =>
  `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n${HTML_HEADER}\n\n${skill.body}`;

export const renderCursorRulesFile = (cursorRulesSrc: string): string => {
  const normalized = cursorRulesSrc.replace(/\r\n/g, "\n");
  const match = normalized.match(/^(---\n[\s\S]*?\n---)\n([\s\S]*)$/);

  if (!match) {
    throw new Error(".ai/cursor-rules.md: missing YAML frontmatter");
  }

  return `${match[1]}\n${HTML_HEADER}\n\n${match[2]!.replace(/^\n+/, "")}`;
};

export const renderSerenaProject = (source: string): string =>
  `${TOML_HEADER}\n\n${source.trim()}\n`;

/** Seed keys the installer owns in `.serena/project.yml`; `project.local.yml` stays the personal override. */
const SERENA_SEED_MANAGED_KEYS = [
  "line_ending",
  "excluded_apis",
  "included_apis",
  "read_only_memory_patterns"
] as const;

/**
 * Apply the seed to an installed Serena project. Managed keys take the seed value, the
 * deprecated `base_modes` key is removed, and missing workspace roots are appended. Serena's
 * own migrations, comments, and personal keys are kept.
 */
export const mergeSerenaProjectSeed = (
  seedSource: string,
  installedContent: string,
  root = REPO_ROOT
): string => {
  const seed: unknown = parseYaml(seedSource);
  if (!isRecord(seed)) throw new Error("Invalid Serena project seed");
  const document = parseDocument(installedContent);
  if (document.errors.length) throw new Error("Invalid installed Serena project YAML");
  const installed: unknown = document.toJS();
  let changed = false;
  for (const key of SERENA_SEED_MANAGED_KEYS) {
    if (
      key in seed &&
      !isDeepStrictEqual(isRecord(installed) ? installed[key] : undefined, seed[key])
    ) {
      document.set(key, seed[key]);
      changed = true;
    }
  }
  if (document.has("base_modes")) {
    document.delete("base_modes");
    changed = true;
  }
  const result = () => (changed ? document.toString() : installedContent);
  const requested: unknown = seed.ls_additional_workspace_folders;
  if (requested === undefined) return result();
  if (
    !Array.isArray(requested) ||
    !requested.every((entry): entry is string => typeof entry === "string")
  ) {
    throw new Error("Invalid Serena workspace folders in seed");
  }
  const existing: unknown = document.get("ls_additional_workspace_folders", true);
  if (
    existing != null &&
    (!isSeq(existing) ||
      !existing.items.every((entry) => isScalar(entry) && typeof entry.value === "string"))
  ) {
    throw new Error("Invalid installed Serena workspace folders");
  }
  const configured = isSeq(existing)
    ? existing.items.map((entry) => (isScalar(entry) ? entry.value : null))
    : [];
  const missing = requested.filter(
    (folder) => existsSync(join(root, folder, "tsconfig.json")) && !configured.includes(folder)
  );
  if (!missing.length) return result();
  if (isSeq(existing)) {
    for (const folder of missing) existing.add(folder);
  } else {
    document.set("ls_additional_workspace_folders", missing);
  }
  return document.toString();
};

// Serena migrates .serena/project.yml in place (schema upgrades rename and add
// keys), so byte-comparing it against the seed flags every migration as drift
// forever. Only the semantics the seed is responsible for are checked.
export const checkSerenaProjectSemantics = (
  seedSource: string,
  installedContent: string,
  root = REPO_ROOT
): string[] => {
  const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});
  const asStringList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

  let seed: Record<string, unknown>;
  try {
    seed = asRecord(parseYaml(seedSource));
  } catch {
    return ["canonical .ai/serena-project.yml is not valid YAML"];
  }
  let installed: Record<string, unknown>;
  try {
    installed = asRecord(parseYaml(installedContent));
  } catch {
    return ["file is not valid YAML"];
  }

  const problems: string[] = [];
  if (installed.project_name !== seed.project_name) {
    problems.push(`project_name is not ${JSON.stringify(seed.project_name)}`);
  }
  const expectedLanguages = asStringList(seed.language_servers ?? seed.languages);
  const installedLanguages = asStringList(installed.language_servers ?? installed.languages);
  for (const language of expectedLanguages) {
    if (!installedLanguages.includes(language)) {
      problems.push(`language server "${language}" is not configured`);
    }
  }
  for (const key of SERENA_SEED_MANAGED_KEYS) {
    if (key in seed && !isDeepStrictEqual(installed[key], seed[key])) {
      problems.push(`${key} differs from the seed`);
    }
  }
  const expectedFolders = asStringList(seed.ls_additional_workspace_folders);
  const installedFolders = asStringList(installed.ls_additional_workspace_folders);
  for (const folder of expectedFolders) {
    if (existsSync(join(root, folder, "tsconfig.json")) && !installedFolders.includes(folder)) {
      problems.push(`workspace folder "${folder}" is not configured`);
    }
  }
  return problems;
};

// Doctor exit policy: lint errors always fail; drift fails only under --strict,
// and only for committed artifacts (local installs are absent in CI checkouts).
export const shouldFailDoctor = (options: {
  lintErrorCount: number;
  strictDriftCount: number;
  strict: boolean;
}): boolean => options.lintErrorCount > 0 || (options.strict && options.strictDriftCount > 0);

export const renderSerenaMemory = (source: string): string =>
  `${HTML_HEADER}\n\n${source.trim()}\n`;

export const renderReviewDoc = (
  source: string,
  projectReview: string | null = readOptionalSource(PROJECT_REVIEW_SRC)
): string => `${HTML_HEADER}\n\n${appendProjectSource(source, projectReview)}\n`;

/** Claude Code needs `type: "http"` beside a remote `url`; Cursor infers the transport. */
export const renderMcpJson = (source: McpSource, agent: "claude" | "cursor"): string => {
  const mcpServers = Object.fromEntries(
    Object.entries(source.mcpServers).map(([name, server]) => [
      name,
      agent === "claude" && server.url ? { type: "http", ...server } : server
    ])
  );
  return `${JSON.stringify({ _generated: GEN_NOTICE, mcpServers }, null, 2)}\n`;
};

export const publicMcpServer = (server: McpServer): McpServer => {
  const result: McpServer = {};
  if (server.command) {
    result.command = server.command;
  }
  if (server.url) {
    result.url = server.url;
  }
  if (server.args) {
    result.args = server.args;
  }
  if (server.env) {
    result.env = server.env;
  }
  return result;
};

const mcpEnvPlaceholderValue = (value: string, localEnv: Record<string, string>): string | null => {
  const fullMatch = value.match(/^\$\{([A-Z0-9_]+)(?::-(.*))?}$/);
  if (!fullMatch) {
    return value;
  }

  const envName = fullMatch[1]!;
  const fallback = fullMatch[2];
  return mcpEnvValue(envName, localEnv) ?? fallback ?? null;
};

const resolveMcpServerEnv = (
  server: McpServer,
  localEnv: Record<string, string>
): McpServer | null => {
  if (!server.env) {
    return publicMcpServer(server);
  }

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(server.env)) {
    const resolved = mcpEnvPlaceholderValue(value, localEnv);
    if (resolved === null) {
      return null;
    }
    env[key] = resolved;
  }

  return publicMcpServer({ ...server, env });
};

export const resolveMcpServerForAgent = (
  name: string,
  server: McpServer,
  agent: Agent,
  isPersonal = false,
  serenaInterface: SerenaInterface = "REPL"
): McpServer => {
  if (name !== "serena" || isPersonal || (agent !== "codex" && agent !== "claude")) {
    return server;
  }
  const args = [...(server.args ?? [])];
  const replace = (flag: string, value: string) => {
    const index = args.indexOf(flag);
    if (index >= 0 && index + 1 < args.length) args[index + 1] = value;
  };
  replace("--context", agent === "codex" ? "codex" : "claude-code");
  replace("--agent-interface", serenaInterface);
  return { ...server, args };
};

export const resolveInstallMcpSource = (
  source: McpSource,
  options: ResolveInstallMcpSourceOptions
): ResolvedInstallMcpSource => {
  const selected = new Set(options.mcps);
  const includeAll = selected.has("all") || (selected.size === 0 && !options.exactSelection);
  const mcpServers: Record<string, McpServer> = {};
  const skipped: string[] = [];

  for (const [name, server] of Object.entries(source.mcpServers)) {
    const agents = server.agents ?? [...AGENTS];
    const isPersonal = options.personalNames.has(name);
    if (!agents.includes(options.agent)) {
      continue;
    }
    if (!includeAll && !selected.has(name) && !isPersonal) {
      continue;
    }
    if (server.default === false && !isPersonal && selected.size === 0) {
      continue;
    }

    const resolved = resolveMcpServerEnv(
      resolveMcpServerForAgent(name, server, options.agent, isPersonal, options.serenaInterface),
      options.localEnv
    );
    if (!resolved) {
      skipped.push(name);
      continue;
    }

    mcpServers[name] = resolved;
  }

  return { source: { mcpServers }, skipped };
};

export const missingEnvVarsForMcpServers = (
  source: McpSource,
  serverNames: Iterable<string>,
  localEnv: Record<string, string>
): string[] => {
  const missing = new Set<string>();

  for (const name of serverNames) {
    const server = source.mcpServers[name];
    if (!server?.env) {
      continue;
    }

    for (const value of Object.values(server.env)) {
      const match = value.match(/^\$\{([A-Z0-9_]+)(?::-(.*))?}$/);
      if (!match) {
        continue;
      }
      const envName = match[1]!;
      const fallback = match[2];
      if (fallback === undefined && mcpEnvValue(envName, localEnv) === undefined) {
        missing.add(envName);
      }
    }
  }

  return [...missing].sort((left, right) => left.localeCompare(right));
};

const renderMcpServersToml = (source: McpSource): string[] => {
  const lines: string[] = [];

  for (const [name, server] of Object.entries(source.mcpServers)) {
    lines.push(`[mcp_servers.${name}]`);
    if (server.command) {
      lines.push(`command = ${JSON.stringify(server.command)}`);
    }
    if (server.url) {
      lines.push(`url = ${JSON.stringify(server.url)}`);
    }
    if (server.args) {
      lines.push(`args = ${JSON.stringify(server.args)}`);
    }
    if (server.env) {
      lines.push("");
      lines.push(`[mcp_servers.${name}.env]`);
      for (const [key, value] of Object.entries(server.env)) {
        lines.push(`${key} = ${JSON.stringify(value)}`);
      }
    }
    lines.push("");
  }

  return lines;
};

export const renderCodexConfig = (source: McpSource): string => {
  const lines: string[] = [
    TOML_HEADER,
    "",
    "[features]",
    "hooks = true",
    "",
    "[[hooks.SessionStart]]",
    'matcher = "startup|resume"',
    "",
    "[[hooks.SessionStart.hooks]]",
    'type = "command"',
    `command = ${JSON.stringify(`${AI_CONTEXT_HOOK_COMMAND} --agent codex`)}`,
    'statusMessage = "Loading Kaine Forge AI context"',
    "",
    // This command policy uses Codex's canonical Bash hook name for shell tools.
    "[[hooks.PreToolUse]]",
    'matcher = "^Bash$"',
    "",
    "[[hooks.PreToolUse.hooks]]",
    'type = "command"',
    `command = ${JSON.stringify(`${PRE_TOOL_USE_HOOK_COMMAND} --agent codex`)}`,
    `timeout = ${String(PRE_TOOL_USE_TIMEOUT_SECONDS)}`,
    "",
    ...renderMcpServersToml(source)
  ];

  return lines.join("\n").replace(/\n+$/, "\n");
};

/** Project-scoped Grok Build MCP config (`.grok/config.toml`). Hooks live under `.grok/hooks/`. */
export const renderGrokConfig = (source: McpSource): string => {
  const lines: string[] = [TOML_HEADER, "", ...renderMcpServersToml(source)];
  return lines.join("\n").replace(/\n+$/, "\n");
};

/** Project-scoped Grok SessionStart hook (`.grok/hooks/kaine-session-start.json`). */
export const renderGrokSessionStartHook = (): string =>
  `${JSON.stringify(
    {
      hooks: {
        // Grok loads native SessionStart hooks without Claude-style matchers.
        // A matcher like "startup|resume" is silently skipped by Grok Build.
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: `${AI_CONTEXT_HOOK_COMMAND} --agent grok`,
                statusMessage: "Loading Kaine Forge AI context"
              }
            ]
          }
        ]
      }
    },
    null,
    2
  )}\n`;

/** Grok Build reads hook files from `.grok/hooks/`; it accepts the Claude JSON shape. */
export const renderGrokPreToolUseHook = (): string =>
  `${JSON.stringify(
    {
      hooks: {
        PreToolUse: [
          {
            matcher: ".*",
            hooks: [
              {
                type: "command",
                command: `${PRE_TOOL_USE_HOOK_COMMAND} --agent grok`,
                timeout: PRE_TOOL_USE_TIMEOUT_SECONDS
              }
            ]
          }
        ]
      }
    },
    null,
    2
  )}\n`;

/**
 * Cursor splits pre-execution into granular events; `beforeShellExecution` is
 * the shell one. Project hooks run from the project root on every platform.
 * Contract: https://cursor.com/docs/hooks
 */
export const renderCursorHooks = (): string =>
  `${JSON.stringify(
    {
      version: 1,
      hooks: {
        beforeShellExecution: [
          {
            command: "node .ai/hooks/pre-tool-use.mjs --agent cursor",
            timeout: PRE_TOOL_USE_TIMEOUT_SECONDS
          }
        ]
      }
    },
    null,
    2
  )}\n`;

/**
 * OpenCode has no JSON hook format; a `PreToolUse` block there is silently
 * ignored. Its equivalent is a plugin listening on `tool.execute.before`, so
 * this renders one that reuses the shared matcher rather than restating the
 * policy. The community compatibility wrapper is deliberately avoided: a
 * third-party dependency inside the guardrail is a worse trade than 20 lines.
 */
export const renderOpencodeGuardrailPlugin = (): string =>
  `// ${GEN_NOTICE}
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  guardedCommandMessage,
  loadGuardedCommandRules,
  matchGuardedCommand
} from "../../.ai/hooks/guarded-command.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const readRules = () => {
  try {
    return loadGuardedCommandRules(join(repoRoot, ".ai", "permissions.json"));
  } catch {
    // Fail open, like the hook: a broken policy must not block every command.
    return [];
  }
};

// Contract: https://opencode.ai/docs/plugins/
export const KaineGuardrail = async () => ({
    "tool.execute.before": async (
      input: { tool: string },
      output: { args: { command?: unknown } }
    ) => {
      if (input.tool !== "bash" || typeof output.args.command !== "string") {
        return;
      }
      const rule = matchGuardedCommand(output.args.command, readRules());
      // This callback blocks by throwing; ask rules retain the advisory policy.
      if (rule && rule.decision === "deny") {
        throw new Error(guardedCommandMessage(rule));
      }
      if (rule) {
        console.warn(guardedCommandMessage(rule));
      }
    }
});
`;

export const removeLegacyOpencodeGuardrail = (repoRoot: string): boolean => {
  const legacy = join(repoRoot, ".opencode", "plugin", "kaine-guardrail.ts");
  if (
    !existsSync(legacy) ||
    readFileSync(legacy, "utf8").split(/\r?\n/, 1)[0] !== `// ${GEN_NOTICE}`
  ) {
    return false;
  }
  rmSync(legacy);
  return true;
};

/** OpenCode's 5000 ms default is shorter than a first-run `npx -y` or `uvx --from git+` fetch. */
const OPENCODE_MCP_TIMEOUT_MS = 30_000;

export const renderOpencodeConfig = (source: McpSource): string => {
  const mcp: Record<string, unknown> = {};

  for (const [name, server] of Object.entries(source.mcpServers)) {
    if (server.url) {
      mcp[name] = { type: "remote", url: server.url, enabled: true };
      continue;
    }
    // validateMcpServers rejects a server with neither field before install renders it.
    if (!server.command) {
      continue;
    }

    mcp[name] = {
      type: "local",
      command: [server.command, ...(server.args ?? [])],
      enabled: true,
      timeout: OPENCODE_MCP_TIMEOUT_MS,
      ...(server.env ? { environment: server.env } : {})
    };
  }

  const permission = { bash: opencodePermissionEntries(readPermissionsSource()) };
  return `${JSON.stringify({ $schema: "https://opencode.ai/config.json", permission, mcp }, null, 2)}\n`;
};

export const writeGenerated = (
  filePath: string,
  newContent: string,
  results: WriteResult[]
): void => {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
  if (existing !== null && generatedTextEqual(existing, newContent)) {
    results.push({ file: filePath, status: "unchanged" });
    return;
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, newContent);
  results.push({
    file: filePath,
    status: existing === null ? "created" : "updated"
  });
};

export const referencedEnvVars = (source: string): string[] => {
  const vars = new Set<string>();

  for (const match of source.matchAll(/\$\{([A-Z0-9_]+)(?::-[^}]*)?}/g)) {
    vars.add(match[1]!);
  }

  return [...vars].sort((left, right) => left.localeCompare(right));
};
