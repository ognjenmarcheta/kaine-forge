import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format as formatWithPrettier } from "prettier";

const GENERATED_MARKER = "GENERATED FROM .ai; DO NOT EDIT DIRECTLY.";
const HTML_NOTICE = `<!-- ${GENERATED_MARKER} Run pnpm ai:sync. -->`;
const TOML_NOTICE = `# ${GENERATED_MARKER} Run pnpm ai:sync.`;
const HASH_NOTICE = `# ${GENERATED_MARKER} Run pnpm ai:sync.`;

const aiDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(aiDir, "..");
const checkMode = process.argv.includes("--check");

interface GeneratedTarget {
  content: string;
  path: string;
}

interface Skill {
  argumentHint?: string;
  body: string;
  description: string;
  name: string;
  raw: string;
  sourcePath: string;
}

interface McpServer {
  args?: string[];
  command?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  url?: string;
}

interface McpConfig {
  mcpServers: Record<string, McpServer>;
}

function readUtf8(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (typeof nestedValue !== "string") {
      return undefined;
    }
    result[key] = nestedValue;
  }

  return result;
}

function parseMcpConfig(raw: unknown): McpConfig {
  if (!isRecord(raw) || !isRecord(raw.mcpServers)) {
    throw new Error(".ai/mcp.json must contain an mcpServers object.");
  }

  const mcpServers: Record<string, McpServer> = {};

  for (const [name, value] of Object.entries(raw.mcpServers)) {
    if (!isRecord(value)) {
      throw new Error(`MCP server "${name}" must be an object.`);
    }

    const server: McpServer = {};

    if (typeof value.command === "string") {
      server.command = value.command;
    }
    if (isStringArray(value.args)) {
      server.args = value.args;
    }
    if (typeof value.url === "string") {
      server.url = value.url;
    }

    const env = readStringRecord(value.env);
    if (env) {
      server.env = env;
    }

    const headers = readStringRecord(value.headers);
    if (headers) {
      server.headers = headers;
    }

    if (!server.command && !server.url) {
      throw new Error(`MCP server "${name}" must define either command or url.`);
    }

    mcpServers[name] = server;
  }

  return { mcpServers };
}

function readSkills(): Skill[] {
  const skillsDir = path.join(aiDir, "skills");

  return readdirSync(skillsDir)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort()
    .map((fileName) => {
      const sourcePath = path.join(skillsDir, fileName);
      const raw = readUtf8(sourcePath).trim();
      const parsed = parseSkillFrontmatter(raw);
      const fallbackName = fileName.replace(/\.md$/, "");
      const name = sanitizeSkillName(parsed.metadata.name ?? fallbackName);
      const description = parsed.metadata.description ?? "No description provided.";
      const argumentHint = parsed.metadata["argument-hint"];

      return {
        ...(argumentHint ? { argumentHint } : {}),
        body: parsed.body.trim(),
        description,
        name,
        raw,
        sourcePath
      };
    });
}

function parseSkillFrontmatter(raw: string): {
  body: string;
  metadata: Record<string, string>;
} {
  if (!raw.startsWith("---\n")) {
    return { body: raw, metadata: {} };
  }

  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) {
    return { body: raw, metadata: {} };
  }

  const frontmatter = raw.slice(4, end);
  const body = raw.slice(end + "\n---\n".length);
  const metadata: Record<string, string> = {};

  for (const line of frontmatter.split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    metadata[key] = stripQuotes(value);
  }

  return { body, metadata };
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function sanitizeSkillName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function withHtmlNoticeAfterFrontmatter(raw: string): string {
  if (!raw.startsWith("---\n")) {
    return `${HTML_NOTICE}\n\n${raw.trim()}\n`;
  }

  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) {
    return `${HTML_NOTICE}\n\n${raw.trim()}\n`;
  }

  const frontmatter = raw.slice(0, end + "\n---\n".length).trimEnd();
  const body = raw.slice(end + "\n---\n".length).trim();

  return `${frontmatter}\n\n${HTML_NOTICE}\n\n${body}\n`;
}

function buildSkillsIndex(skills: Skill[]): string {
  return skills.map((skill) => `- \`${skill.name}\`: ${skill.description}`).join("\n");
}

function buildAgentDoc(guide: string, skills: Skill[]): string {
  return `${HTML_NOTICE}

${guide.trim()}

## Generated Skills Index

${buildSkillsIndex(skills)}
`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function buildCursorSkill(skill: Skill): string {
  const argumentHint = skill.argumentHint
    ? `\nargumentHint: ${yamlString(skill.argumentHint)}`
    : "";

  return `---
description: ${yamlString(skill.description)}
alwaysApply: false${argumentHint}
---

${HTML_NOTICE}

${skill.body}
`;
}

function buildCodexConfig(config: McpConfig): string {
  const lines: string[] = [TOML_NOTICE, ""];

  for (const [name, server] of Object.entries(config.mcpServers).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    lines.push(`[mcp_servers.${name}]`);

    if (server.command) {
      lines.push(`command = ${tomlString(server.command)}`);
    }
    if (server.url) {
      lines.push(`url = ${tomlString(server.url)}`);
    }
    if (server.args) {
      lines.push(`args = [${server.args.map(tomlString).join(", ")}]`);
    }
    if (server.env && Object.keys(server.env).length > 0) {
      lines.push("");
      lines.push(`[mcp_servers.${name}.env]`);
      for (const [key, value] of Object.entries(server.env).sort(([left], [right]) =>
        left.localeCompare(right)
      )) {
        lines.push(`${key} = ${tomlString(value)}`);
      }
    }
    if (server.headers && Object.keys(server.headers).length > 0) {
      lines.push("");
      lines.push(`[mcp_servers.${name}.headers]`);
      for (const [key, value] of Object.entries(server.headers).sort(([left], [right]) =>
        left.localeCompare(right)
      )) {
        lines.push(`${key} = ${tomlString(value)}`);
      }
    }

    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

async function formatJson(content: string): Promise<string> {
  return formatWithPrettier(content, { parser: "json" });
}

async function queueTargets(): Promise<GeneratedTarget[]> {
  const guide = readUtf8(path.join(aiDir, "guide.md"));
  const cursorRules = readUtf8(path.join(aiDir, "cursor-rules.md"));
  const skills = readSkills();
  const mcpRaw = JSON.parse(readUtf8(path.join(aiDir, "mcp.json"))) as unknown;
  const mcpConfig = parseMcpConfig(mcpRaw);
  const mcpJson = await formatJson(`${JSON.stringify(mcpConfig, null, 2)}\n`);
  const targets: GeneratedTarget[] = [];

  targets.push({
    content: buildAgentDoc(guide, skills),
    path: path.join(repoRoot, "AGENTS.md")
  });
  targets.push({
    content: buildAgentDoc(guide, skills),
    path: path.join(repoRoot, "CLAUDE.md")
  });
  targets.push({
    content: mcpJson,
    path: path.join(repoRoot, ".mcp.json")
  });
  targets.push({
    content: mcpJson,
    path: path.join(repoRoot, ".cursor", "mcp.json")
  });
  targets.push({
    content: buildCodexConfig(mcpConfig),
    path: path.join(repoRoot, ".codex", "config.toml")
  });
  targets.push({
    content: withHtmlNoticeAfterFrontmatter(cursorRules),
    path: path.join(repoRoot, ".cursor", "rules", "kaine-forge-rules.mdc")
  });

  for (const skill of skills) {
    targets.push({
      content: withHtmlNoticeAfterFrontmatter(skill.raw),
      path: path.join(repoRoot, ".claude", "skills", skill.name, "SKILL.md")
    });
    targets.push({
      content: withHtmlNoticeAfterFrontmatter(skill.raw),
      path: path.join(repoRoot, ".codex", "skills", skill.name, "SKILL.md")
    });
    targets.push({
      content: buildCursorSkill(skill),
      path: path.join(repoRoot, ".cursor", "rules", `skill-${skill.name}.mdc`)
    });
  }

  const memoriesDir = path.join(aiDir, "serena-memories");
  for (const fileName of readdirSync(memoriesDir)
    .filter((file) => file.endsWith(".md"))
    .sort()) {
    targets.push({
      content: `${HTML_NOTICE}\n\n${readUtf8(path.join(memoriesDir, fileName)).trim()}\n`,
      path: path.join(repoRoot, ".serena", "memories", fileName)
    });
  }

  const serenaProjectPath = path.join(aiDir, "serena-project.yml");
  if (existsSync(serenaProjectPath)) {
    targets.push({
      content: `${HASH_NOTICE}\n\n${readUtf8(serenaProjectPath).trim()}\n`,
      path: path.join(repoRoot, ".serena", "project.yml")
    });
  }

  return targets;
}

function writeOrCheckTargets(targets: GeneratedTarget[]): string[] {
  const drift: string[] = [];

  for (const target of targets) {
    const existing = existsSync(target.path) ? readUtf8(target.path) : null;
    if (existing === target.content) {
      continue;
    }

    if (checkMode) {
      drift.push(path.relative(repoRoot, target.path));
      continue;
    }

    mkdirSync(path.dirname(target.path), { recursive: true });
    writeFileSync(target.path, target.content, "utf8");
  }

  return drift;
}

function removeStaleGeneratedSkillOutputs(skills: Skill[]): string[] {
  const drift: string[] = [];
  const skillNames = new Set(skills.map((skill) => skill.name));

  for (const baseDir of [
    path.join(repoRoot, ".claude", "skills"),
    path.join(repoRoot, ".codex", "skills")
  ]) {
    if (!existsSync(baseDir)) {
      continue;
    }

    for (const entry of readdirSync(baseDir)) {
      const entryPath = path.join(baseDir, entry);
      if (!statSync(entryPath).isDirectory() || skillNames.has(entry)) {
        continue;
      }

      const skillFile = path.join(entryPath, "SKILL.md");
      if (!existsSync(skillFile) || !readUtf8(skillFile).includes(GENERATED_MARKER)) {
        continue;
      }

      const relativePath = path.relative(repoRoot, entryPath);
      if (checkMode) {
        drift.push(relativePath);
      } else {
        rmSync(entryPath, { force: true, recursive: true });
      }
    }
  }

  const cursorRulesDir = path.join(repoRoot, ".cursor", "rules");
  if (!existsSync(cursorRulesDir)) {
    return drift;
  }

  for (const entry of readdirSync(cursorRulesDir)) {
    if (!entry.startsWith("skill-") || !entry.endsWith(".mdc")) {
      continue;
    }

    const skillName = entry.replace(/^skill-/, "").replace(/\.mdc$/, "");
    const entryPath = path.join(cursorRulesDir, entry);
    if (skillNames.has(skillName) || !readUtf8(entryPath).includes(GENERATED_MARKER)) {
      continue;
    }

    const relativePath = path.relative(repoRoot, entryPath);
    if (checkMode) {
      drift.push(relativePath);
    } else {
      rmSync(entryPath, { force: true });
    }
  }

  return drift;
}

async function main(): Promise<void> {
  const targets = await queueTargets();
  const skills = readSkills();
  const drift = [...writeOrCheckTargets(targets), ...removeStaleGeneratedSkillOutputs(skills)];

  if (drift.length > 0) {
    if (checkMode) {
      console.error("Generated AI assistant files are out of sync:");
      for (const filePath of drift) {
        console.error(`- ${filePath}`);
      }
      process.exit(1);
    }
  }

  if (checkMode) {
    console.log("AI assistant generated files are in sync.");
  } else {
    console.log("AI assistant files synced.");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
