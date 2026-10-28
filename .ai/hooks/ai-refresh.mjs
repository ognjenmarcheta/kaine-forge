#!/usr/bin/env node

// Keeps installed AI files current without a manual `pnpm ai:install`. Session-start hooks
// and the Claude prompt hook run the refresh whenever `.ai/` inputs changed, which catches
// `but pull`, branch switches, and edits that no agent hook event reports.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const STAMP_PATH = join(".ai.local", "install-stamp.json");
const INSTALL_TIMEOUT_MS = 30_000;

/** Path, size, and mtime of every install input; pulls, checkouts, and edits all change it. */
export const inputFingerprint = (root) => {
  const hash = createHash("sha1");
  const add = (file) => {
    const { size, mtimeMs } = statSync(file);
    hash.update(`${relative(root, file)}\0${String(size)}\0${String(mtimeMs)}\n`);
  };
  const visit = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1
    );
    for (const entry of entries) {
      if (entry.name === "node_modules") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else add(path);
    }
  };
  visit(join(root, ".ai"));
  for (const name of ["mcp.json", "mcp.env"]) {
    const file = join(root, ".ai.local", name);
    if (existsSync(file)) add(file);
  }
  return hash.digest("hex");
};

const readStamp = (root) => {
  try {
    return JSON.parse(readFileSync(join(root, STAMP_PATH), "utf8")).fingerprint;
  } catch {
    return undefined;
  }
};

const writeStamp = (root, fingerprint) => {
  const file = join(root, STAMP_PATH);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ fingerprint })}\n`);
};

const failureReason = (error) => {
  const stderr = String(error?.stderr ?? "").trim();
  const firstLine = stderr.split("\n").find((line) => line.trim());
  if (error?.code === "ETIMEDOUT") return "timed out";
  if (/tsx/.test(stderr) && /Cannot find/.test(stderr))
    return "dependencies missing; run pnpm install";
  return firstLine ?? error?.message ?? String(error);
};

/**
 * Runs `ai:install --auto` in each checkout root whose inputs changed since its last
 * successful refresh. Hand edits to generated outputs survive until the inputs change.
 */
export const refreshAiSetup = (roots) => {
  const lines = new Set();
  const failures = [];
  const unique = [...new Set(roots.filter(Boolean).map((root) => resolve(root)))];
  for (const root of unique) {
    if (!existsSync(join(root, ".ai", "install.ts"))) continue;
    let fingerprint;
    try {
      fingerprint = inputFingerprint(root);
    } catch {
      // An unreadable input never matches a stamp, so the install still runs.
    }
    if (fingerprint !== undefined && readStamp(root) === fingerprint) continue;
    try {
      const output = execFileSync(
        process.execPath,
        ["--import", "tsx", join(root, ".ai", "install.ts"), "--auto"],
        {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: INSTALL_TIMEOUT_MS,
          windowsHide: true
        }
      );
      for (const line of output.split("\n")) if (line.trim()) lines.add(line.trim());
      if (fingerprint !== undefined) writeStamp(root, fingerprint);
    } catch (error) {
      failures.push(`AI auto-install failed in ${root}: ${failureReason(error)}`);
    }
  }
  return {
    lines: [...lines],
    failures,
    refreshed: [...lines].some((line) => line.startsWith("AI setup refreshed"))
  };
};

/** Claude worktree sessions read skills and MCP config from `CLAUDE_PROJECT_DIR`. */
export const refreshRoots = (agent, repoRoot) =>
  agent === "claude" ? [process.env.CLAUDE_PROJECT_DIR, repoRoot] : [repoRoot];

// Prompt hook entry: print only what changed, and stay silent on failure. Session start
// reports failures, so a broken install does not repeat its warning on every prompt.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const agentIndex = args.indexOf("--agent");
    const agent = agentIndex >= 0 ? args[agentIndex + 1] : "claude";
    let cwd = process.cwd();
    try {
      const input = JSON.parse(readFileSync(0, "utf8") || "{}");
      if (typeof input.cwd === "string") cwd = input.cwd;
    } catch {
      // No hook input: refresh the current directory's checkout.
    }
    const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
      windowsHide: true
    }).trim();
    const { lines } = refreshAiSetup(refreshRoots(agent, repoRoot));
    if (lines.length > 0) process.stdout.write(`${lines.join("\n")}\n`);
  } catch {
    // Outside a git checkout there is nothing to refresh.
  }
}
