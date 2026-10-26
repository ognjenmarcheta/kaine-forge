#!/usr/bin/env node

// Graphify knowledge-graph status, shared by the SessionStart hook, `pnpm doctor`,
// and the `pnpm graph*` scripts. Plain .mjs so SessionStart pays no tsx cold start.
// Freshness is measured in commits and changed files since the recorded build, not
// in days: a busy afternoon can stale the graph, and a quiet month does not.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

/** The one tested Graphify release; bump it deliberately, like the MCP pins. */
export const GRAPHIFY_VERSION = "0.9.95";
export const GRAPHIFY_INSTALL = `uv tool install "graphifyy[sql,mcp]==${GRAPHIFY_VERSION}"`;

const BUILD_RECORD = join("graphify-out", "kaine-build.json");

const exec = (cwd, command, args) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 2000,
    windowsHide: true
  });

const run = (cwd, command, args) => exec(cwd, command, args).trim();

/** Installed CLI version (`graphify 0.9.95` → `0.9.95`), or null when the optional CLI is absent. */
export const probeCliVersion = (cwd) => {
  try {
    return run(cwd, "graphify", ["--version"]).split(/\s+/).pop() ?? null;
  } catch {
    return null;
  }
};

const readRecord = (repoRoot) => {
  try {
    const record = JSON.parse(readFileSync(join(repoRoot, BUILD_RECORD), "utf8"));
    return typeof record.head === "string" && typeof record.builtAt === "number" ? record : null;
  } catch {
    return null;
  }
};

/** Commits on either side of the build commit, so a branch switch counts too; null when unknown. */
const commitsSince = (repoRoot, head) => {
  try {
    return Number(run(repoRoot, "git", ["rev-list", "--count", `${head}...HEAD`]));
  } catch {
    return null;
  }
};

/** Working-tree paths (tracked or untracked) changed after the build; a deleted path counts. */
const filesChangedSince = (repoRoot, builtAt) => {
  let status = "";
  try {
    // Untrimmed: the first entry's status column can start with a space.
    status = exec(repoRoot, "git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  } catch {
    return 0;
  }
  const entries = status.split("\0").filter(Boolean);
  let changed = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    // A rename or copy entry is followed by its original path.
    if (entry[0] === "R" || entry[0] === "C") i++;
    try {
      if (statSync(join(repoRoot, entry.slice(3))).mtimeMs > builtAt) changed++;
    } catch {
      changed++;
    }
  }
  return changed;
};

/**
 * @param {string} repoRoot
 * @param {string | null} cliVersion from `probeCliVersion`; callers probe once and reuse it
 */
export const graphStatus = (repoRoot, cliVersion) => {
  if (cliVersion === null) return { state: "cli-missing" };
  const versionMismatch = cliVersion === GRAPHIFY_VERSION ? null : cliVersion;
  if (!existsSync(join(repoRoot, "graphify-out", "graph.json"))) {
    return { state: "absent", versionMismatch };
  }
  const record = readRecord(repoRoot);
  const commits = record ? commitsSince(repoRoot, record.head) : null;
  const files = record ? filesChangedSince(repoRoot, record.builtAt) : 0;
  const state = commits === 0 && files === 0 ? "fresh" : "stale";
  return { state, commits, files, versionMismatch };
};

export const formatStatusLine = (status) => {
  const prefix = "- Knowledge graph:";
  if (status.state === "cli-missing") {
    return `${prefix} Graphify CLI not installed (optional; install: ${GRAPHIFY_INSTALL})`;
  }
  const mismatch = status.versionMismatch
    ? `; Graphify ${status.versionMismatch} installed, repo pins ${GRAPHIFY_VERSION} (${GRAPHIFY_INSTALL})`
    : "";
  if (status.state === "absent") {
    return `${prefix} not built in this checkout; run pnpm graph before impact queries${mismatch}`;
  }
  if (status.state === "fresh") {
    return `${prefix} fresh; required for impact work (kaine-graph skill)${mismatch}`;
  }
  const since =
    status.commits === null
      ? "unknown build commit"
      : `${status.commits} commits, ${status.files} changed files since build`;
  return `${prefix} stale (${since}); run pnpm graph:update before impact queries${mismatch}`;
};

/** Stamp the build so later status checks can count what changed since. */
export const recordBuild = (repoRoot, cliVersion, now = Date.now()) => {
  const head = run(repoRoot, "git", ["rev-parse", "HEAD"]);
  writeFileSync(
    join(repoRoot, BUILD_RECORD),
    `${JSON.stringify({ head, builtAt: now, version: cliVersion }, null, 2)}\n`
  );
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = run(process.cwd(), "git", ["rev-parse", "--show-toplevel"]);
  const command = process.argv[2];
  if (command === "record") {
    recordBuild(repoRoot, probeCliVersion(repoRoot));
  } else if (command === "status") {
    process.stdout.write(`${formatStatusLine(graphStatus(repoRoot, probeCliVersion(repoRoot)))}\n`);
  } else {
    process.stderr.write("usage: graph-status.mjs record|status\n");
    process.exitCode = 2;
  }
}
