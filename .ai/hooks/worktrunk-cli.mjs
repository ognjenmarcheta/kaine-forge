#!/usr/bin/env node

// worktrunk (`wt`) CLI status, shared by the SessionStart hook and `pnpm doctor`.
// Plain .mjs so SessionStart pays no tsx cold start. The CLI is optional: it creates a
// ready worktree for a parallel agent session from .config/wt.toml (ADR 0024).

import { execFileSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

/** The one tested worktrunk release; bump it deliberately, like the MCP pins. */
export const WORKTRUNK_VERSION = "0.81.0";
export const WORKTRUNK_INSTALL = `cargo install worktrunk --version ${WORKTRUNK_VERSION}`;

/** Installed version (`wt 0.81.0` → `0.81.0`), or null when the optional CLI is absent. */
export const probeWorktrunkVersion = (cwd) => {
  try {
    const output = execFileSync("wt", ["--version"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
      windowsHide: true
    });
    return output.trim().split(/\s+/).pop()?.replace(/^v/, "") ?? null;
  } catch {
    return null;
  }
};

/** @param {string | null} version from `probeWorktrunkVersion` */
export const formatWorktrunkStatusLine = (version) => {
  const prefix = "- Worktrunk:";
  if (version === null) {
    return `${prefix} wt CLI not installed (optional; install: ${WORKTRUNK_INSTALL})`;
  }
  const mismatch =
    version === WORKTRUNK_VERSION
      ? ""
      : `; wt ${version} installed, repo pins ${WORKTRUNK_VERSION} (${WORKTRUNK_INSTALL})`;
  return `${prefix} wt ${version} ready; new agent worktree: wt switch -c -x <agent> <branch>; never wt merge${mismatch}`;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${formatWorktrunkStatusLine(probeWorktrunkVersion(process.cwd()))}\n`);
}
