import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const AI_DIR = join(REPO_ROOT, ".ai");
export const GUIDE_SRC = join(AI_DIR, "guide.md");
export const SKILLS_SRC_DIR = join(AI_DIR, "skills");
export const AGENTS_SRC_DIR = join(AI_DIR, "agents");
export const MCP_SRC = join(AI_DIR, "mcp.json");
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

export const KAINE_PREFIX = "kaine-";
export const GEN_NOTICE = "GENERATED FILE. Do not edit directly. Run: pnpm ai:install";
export const HTML_HEADER = `<!-- ${GEN_NOTICE} -->`;
export const TOML_HEADER = `# ${GEN_NOTICE}`;

export const REVIEW_REQUIRED_HEADINGS = [
  "Correctness",
  "Security, Auth & Tenancy",
  "Architecture & Boundaries",
  "Data & GraphQL",
  "UI & i18n",
  "Quality Gates",
  "Domain Language",
  "Template & AI Hygiene"
] as const;

export const CONTEXT_REQUIRED_HEADINGS = ["Language", "Relationships", "Example dialogue"] as const;

export const REQUIRED_SERENA_MEMORIES = [
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

const ALL_AGENTS = ["claude", "codex", "cursor", "opencode", "grok"] as const;
const EFFORT_LEVELS = ["low", "medium", "high"] as const;
const DESCRIPTION_SOFT_LIMIT = 1500;

export type Agent = (typeof ALL_AGENTS)[number];
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
  frontmatterRaw: string;
  body: string;
}

export interface AgentDefinitionDrift {
  missing: string[];
  stale: string[];
  orphan: string[];
}

export interface McpServer {
  command?: string;
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
  personalNames: Set<string>;
  localEnv: Record<string, string>;
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
  typeof value === "string" && (ALL_AGENTS as readonly string[]).includes(value);

const isEffort = (value: unknown): value is Effort =>
  typeof value === "string" && (EFFORT_LEVELS as readonly string[]).includes(value);

const parseAgentsField = (skillName: string, value: unknown): Agent[] => {
  if (value === undefined || value === null) {
    return [...ALL_AGENTS];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${skillName}: 'agents' must be a list`);
  }

  for (const agent of value) {
    if (!isAgent(agent)) {
      throw new Error(
        `${skillName}: unknown agent '${String(agent)}'. Allowed: ${ALL_AGENTS.join(", ")}.`
      );
    }
  }

  return value as Agent[];
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
    frontmatter = (parseYaml(frontmatterRaw) ?? {}) as Record<string, unknown>;
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
    skill.effort = effortRaw as Effort;
  }
  if (frontmatter["disable-model-invocation"] === true) {
    skill.disableModelInvocation = true;
  }

  return skill;
};

export const discoverSkills = (): Skill[] => {
  const entries = readdirSync(SKILLS_SRC_DIR, { withFileTypes: true });
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const name = entry.name.replace(/\.md$/, "");
    const skill = parseSkillFile(name, readFileSync(join(SKILLS_SRC_DIR, entry.name), "utf8"));

    if (!skill.name.startsWith(KAINE_PREFIX)) {
      throw new Error(`${name}: canonical skill names must start with '${KAINE_PREFIX}'`);
    }

    skills.push(skill);
  }

  return [...skills].sort((left, right) => left.name.localeCompare(right.name));
};

export const lintSkillsDir = (): LintIssue[] => {
  const issues: LintIssue[] = [];
  const entries = readdirSync(SKILLS_SRC_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const name = entry.name.replace(/\.md$/, "");
    const file = join(SKILLS_SRC_DIR, entry.name);

    try {
      const skill = parseSkillFile(name, readFileSync(file, "utf8"));
      if (!skill.name.startsWith(KAINE_PREFIX)) {
        issues.push({
          file,
          level: "error",
          message: `name '${skill.name}' must start with '${KAINE_PREFIX}'`
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

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    frontmatterRaw,
    body
  };
};

export const discoverAgentDefinitions = (dir: string = AGENTS_SRC_DIR): AgentDefinition[] => {
  if (!existsSync(dir)) {
    return [];
  }

  const definitions: AgentDefinition[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const name = entry.name.replace(/\.md$/, "");
    const definition = parseAgentDefinitionFile(name, readFileSync(join(dir, entry.name), "utf8"));

    if (!definition.name.startsWith(KAINE_PREFIX)) {
      throw new Error(
        `${name}: canonical agent definition names must start with '${KAINE_PREFIX}'`
      );
    }

    definitions.push(definition);
  }

  return [...definitions].sort((left, right) => left.name.localeCompare(right.name));
};

export const lintAgentDefinitionsDir = (dir: string = AGENTS_SRC_DIR): LintIssue[] => {
  if (!existsSync(dir)) {
    return [];
  }

  const issues: LintIssue[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const name = entry.name.replace(/\.md$/, "");
    const file = join(dir, entry.name);

    try {
      const definition = parseAgentDefinitionFile(name, readFileSync(file, "utf8"));
      if (!definition.name.startsWith(KAINE_PREFIX)) {
        issues.push({
          file,
          level: "error",
          message: `name '${definition.name}' must start with '${KAINE_PREFIX}'`
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      issues.push({ file, level: "error", message: reason });
    }
  }

  return issues;
};

export const computeAgentDefinitionDrift = (
  definitions: AgentDefinition[],
  dir: string
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
    if (readFileSync(filePath, "utf8") !== renderClaudeAgentDefinition(definition)) {
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

const GUIDE_SKILL_LIST_HEADER = "Use skills when they match the task:";

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
  if (!guideContent.includes(GUIDE_SKILL_LIST_HEADER)) {
    return [
      {
        file: GUIDE_SRC,
        level: "error",
        message: `guide is missing the '${GUIDE_SKILL_LIST_HEADER}' skill list`
      }
    ];
  }

  const issues: LintIssue[] = [];
  const listedNames = new Set(
    Array.from(guideContent.matchAll(/^- `(kaine-[a-z0-9-]+)`:/gm), (match) => match[1] as string)
  );

  for (const name of skillNames) {
    if (!listedNames.has(name)) {
      issues.push({
        file: GUIDE_SRC,
        level: "error",
        message: `skill '${name}' exists in .ai/skills but is missing from the guide skill list`
      });
    }
  }

  const knownNames = new Set(skillNames);
  for (const name of listedNames) {
    if (!knownNames.has(name)) {
      issues.push({
        file: GUIDE_SRC,
        level: "error",
        message: `guide skill list mentions '${name}' but .ai/skills/${name}.md does not exist`
      });
    }
  }

  return issues;
};

export const readGuideSource = (): string => readFileSync(GUIDE_SRC, "utf8");

export const readMcpSource = (): McpSource =>
  JSON.parse(readFileSync(MCP_SRC, "utf8")) as McpSource;

export const readPersonalMcpSource = (): McpSource => {
  if (!existsSync(LOCAL_MCP_SRC)) {
    return { mcpServers: {} };
  }

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

export const renderAgentDoc = (guide: string, skills: Skill[]): string =>
  `${guide.trim()}\n\n## Generated Skills Index\n\n${buildSkillsIndex(skills)}\n`;

export const renderClaudeImport = (): string => "@AGENTS.md\n";

const AI_CONTEXT_HOOK_COMMAND =
  'node "$(git rev-parse --show-toplevel)/.ai/hooks/session-start.mjs"';

export const renderClaudeSettings = (): string =>
  `${JSON.stringify(
    {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command:
                  "uvx --from git+https://github.com/oraios/serena serena prompts print-cc-system-prompt-override || echo 'warning: serena prompt unavailable, run pnpm ai:doctor'"
              }
            ]
          },
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

// Serena migrates .serena/project.yml in place (schema upgrades rename and add
// keys), so byte-comparing it against the seed flags every migration as drift
// forever. Only the semantics the seed is responsible for are checked.
export const checkSerenaProjectSemantics = (
  seedSource: string,
  installedContent: string
): string[] => {
  const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
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

export const renderReviewDoc = (source: string): string => `${HTML_HEADER}\n\n${source.trim()}\n`;

export const renderMcpJson = (source: McpSource): string =>
  `${JSON.stringify({ _generated: GEN_NOTICE, ...source }, null, 2)}\n`;

export const publicMcpServer = (server: McpServer): McpServer => {
  const result: McpServer = {};
  if (server.command) {
    result.command = server.command;
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

export const resolveInstallMcpSource = (
  source: McpSource,
  options: ResolveInstallMcpSourceOptions
): ResolvedInstallMcpSource => {
  const selected = new Set(options.mcps);
  const includeAll = selected.has("all") || selected.size === 0;
  const mcpServers: Record<string, McpServer> = {};
  const skipped: string[] = [];

  for (const [name, server] of Object.entries(source.mcpServers)) {
    const agents = server.agents ?? [...ALL_AGENTS];
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

    const resolved = resolveMcpServerEnv(server, options.localEnv);
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

export const renderOpencodeConfig = (source: McpSource): string => {
  const mcp: Record<string, unknown> = {};

  for (const [name, server] of Object.entries(source.mcpServers)) {
    if (!server.command) {
      continue;
    }

    mcp[name] = {
      type: "local",
      command: [server.command, ...(server.args ?? [])],
      enabled: true,
      ...(server.env ? { environment: server.env } : {})
    };
  }

  return `${JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp }, null, 2)}\n`;
};

export const writeGenerated = (
  filePath: string,
  newContent: string,
  results: WriteResult[]
): void => {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
  if (existing === newContent) {
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
