#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const agentIndex = args.indexOf("--agent");
const agent = agentIndex >= 0 ? args[agentIndex + 1] : "codex";

const readStdinJson = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString("utf8").trim();
  if (!input) {
    return {};
  }
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
};

const execGit = (cwd, gitArgs) =>
  execFileSync("git", gitArgs, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  }).trim();

const findGitRoot = (cwd) => {
  try {
    return execGit(cwd, ["rev-parse", "--show-toplevel"]);
  } catch {
    return null;
  }
};

const currentBranch = (repoRoot) => {
  try {
    return execGit(repoRoot, ["symbolic-ref", "--short", "HEAD"]);
  } catch {
    try {
      return execGit(repoRoot, ["rev-parse", "--short", "HEAD"]);
    } catch {
      return "unknown";
    }
  }
};

const worktreeSummary = (repoRoot) => {
  let status = "";
  try {
    status = execGit(repoRoot, ["status", "--short"]);
  } catch {
    return "unknown";
  }

  if (!status) {
    return "clean";
  }

  const lines = status.split("\n").filter(Boolean);
  const untracked = lines.filter((line) => line.startsWith("??")).length;
  const tracked = lines.length - untracked;
  const parts = [];
  if (tracked > 0) {
    parts.push(`${tracked} tracked`);
  }
  if (untracked > 0) {
    parts.push(`${untracked} untracked`);
  }
  return parts.join(", ");
};

const listFiles = (dir) => {
  if (!existsSync(dir)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(file));
    } else if (entry.isFile()) {
      files.push(file);
    }
  }
  return files;
};

const newestMtime = (paths) => {
  let newest = 0;
  for (const path of paths) {
    if (!existsSync(path)) {
      continue;
    }
    const stat = statSync(path);
    if (stat.isDirectory()) {
      newest = Math.max(newest, newestMtime(listFiles(path)));
    } else {
      newest = Math.max(newest, stat.mtimeMs);
    }
  }
  return newest;
};

const oldestMtime = (paths) => {
  const mtimes = paths.filter((path) => existsSync(path)).map((path) => statSync(path).mtimeMs);
  return mtimes.length === 0 ? 0 : Math.min(...mtimes);
};

const aiHealth = (repoRoot, hookAgent) => {
  const issues = [];
  const sharedGenerated = [join(repoRoot, "AGENTS.md"), join(repoRoot, "CLAUDE.md")];
  for (const file of sharedGenerated) {
    if (!existsSync(file)) {
      issues.push(`Missing ${basename(file)}`);
    }
  }

  if (hookAgent === "claude") {
    if (!existsSync(join(repoRoot, ".mcp.json"))) {
      issues.push("Missing Claude MCP config");
    }
    if (!existsSync(join(repoRoot, ".claude", "skills"))) {
      issues.push("Missing Claude skills");
    }
  } else if (hookAgent === "grok") {
    if (!existsSync(join(repoRoot, ".grok", "config.toml"))) {
      issues.push("Missing Grok config");
    }
    if (!existsSync(join(repoRoot, ".grok", "skills"))) {
      issues.push("Missing Grok skills");
    }
  } else {
    if (!existsSync(join(repoRoot, ".codex", "config.toml"))) {
      issues.push("Missing Codex config");
    }
    if (!existsSync(join(repoRoot, ".agents", "skills"))) {
      issues.push("Missing Codex skills");
    }
  }

  const canonicalNewest = newestMtime([
    join(repoRoot, ".ai", "guide.md"),
    join(repoRoot, ".ai", "skills"),
    join(repoRoot, ".ai", "mcp.json"),
    join(repoRoot, ".ai", "cursor-rules.md")
  ]);
  const generatedAgentDoc = oldestMtime([join(repoRoot, "AGENTS.md")]);
  if (canonicalNewest > 0 && generatedAgentDoc > 0 && canonicalNewest > generatedAgentDoc) {
    issues.push("Generated AI docs may be stale");
  }

  return issues;
};

const main = async () => {
  const input = await readStdinJson();
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  const repoRoot = findGitRoot(cwd);
  if (!repoRoot) {
    return;
  }

  const issues = aiHealth(repoRoot, agent);
  const lines = [
    "Kaine Forge AI context",
    `- Repo: ${basename(repoRoot)}`,
    `- Branch: ${currentBranch(repoRoot)}`,
    `- Worktree: ${worktreeSummary(repoRoot)}`,
    `- AI setup: ${issues.length === 0 ? "healthy" : "needs attention"}`
  ];

  if (issues.length > 0) {
    lines.push(`- Warning: ${issues.join("; ")}`);
    lines.push(`- Run: pnpm ai:install --agent ${agent} && pnpm ai:doctor`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);
};

main().catch(() => {
  process.exitCode = 0;
});
