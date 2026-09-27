#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
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
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 2000,
    windowsHide: true
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

const aiHealth = (repoRoot, hookAgent) => {
  try {
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        join(repoRoot, ".ai/readiness.ts"),
        "--agent",
        hookAgent,
        "--local",
        "--json"
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 4000,
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true
      }
    );
    return JSON.parse(output);
  } catch (error) {
    try {
      const report = JSON.parse(String(error.stdout));
      if (Array.isArray(report.problems)) return report;
    } catch {
      /* Missing dependencies and timeouts are unverified, never healthy. */
    }
    return { installation: "not-verified", problems: ["Installation inspection unavailable"] };
  }
};

const main = async () => {
  const input = await readStdinJson();
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  const repoRoot = findGitRoot(cwd);
  if (!repoRoot) {
    return;
  }

  const health = aiHealth(repoRoot, agent);
  const issues = health.problems;
  const lines = [
    "Kaine Forge AI context",
    `- Repo: ${basename(repoRoot)}`,
    `- Branch: ${currentBranch(repoRoot)}`,
    `- Worktree: ${worktreeSummary(repoRoot)}`,
    `- AI installation: ${health.installation}`,
    "- Runtime verification: MCP and sandbox not verified at startup"
  ];

  if (issues.length > 0) {
    lines.push(`- Warning: ${issues.join("; ")}`);
    lines.push(
      `- Run: pnpm ai:install --agent ${agent} && pnpm ai:doctor --agent ${agent} --local --json`
    );
  }

  process.stdout.write(`${lines.join("\n")}\n`);
};

main().catch(() => {
  process.exitCode = 0;
});
