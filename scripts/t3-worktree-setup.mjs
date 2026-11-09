#!/usr/bin/env node
/* global console, process */
// Sets up a worktree that T3 Code (https://t3.codes) creates for a thread. t3.json runs it once
// per new worktree and holds the agent until it exits ("async": false). It does what the
// worktrunk pre-start hooks in .config/wt.toml do: copy what .worktreeinclude lists from the
// project checkout, install, build the packages, give the worktree its own ports, and refresh
// the AI setup. T3 Code sets T3CODE_PROJECT_ROOT and T3CODE_WORKTREE_PATH.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runWorktreeEnv } from "./worktree-env.mjs";

/**
 * Copies the untracked files and folders that the worktree's .worktreeinclude lists from the
 * project checkout into the worktree.
 * @param {string} projectRoot checkout that holds .env and the personal AI setup
 * @param {string} worktree new worktree
 * @returns {string[]} copied paths, relative to the checkout
 */
export function copyIncluded(projectRoot, worktree) {
  const listed = execFileSync(
    "git",
    [
      "ls-files",
      "--others",
      "--ignored",
      "--directory",
      `--exclude-from=${join(worktree, ".worktreeinclude")}`
    ],
    { cwd: projectRoot, encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean);
  for (const path of listed) {
    cpSync(join(projectRoot, path), join(worktree, path), { recursive: true });
  }
  return listed;
}

/**
 * Stable web and API ports for a worktree path, in the 10000-19999 range that worktrunk uses.
 * The API port is always the web port plus 5000, so the two never collide.
 * @param {string} worktree
 */
export const portsFor = (worktree) => {
  const web = 10000 + (createHash("sha256").update(worktree).digest().readUInt32BE(0) % 5000);
  return { web, api: web + 5000 };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const worktree = resolve(
    process.env.T3CODE_WORKTREE_PATH ?? join(dirname(fileURLToPath(import.meta.url)), "..")
  );
  const projectRoot = process.env.T3CODE_PROJECT_ROOT;
  const run = (/** @type {string[]} */ args) =>
    execFileSync("pnpm", args, { cwd: worktree, stdio: "inherit" });
  try {
    if (!projectRoot) {
      throw new Error("T3CODE_PROJECT_ROOT is not set. Run this through the t3.json setup action.");
    }
    if (resolve(projectRoot) === worktree) {
      throw new Error("This is the project checkout. Run the setup only in a T3 Code worktree.");
    }
    const copied = copyIncluded(projectRoot, worktree);
    console.log(`[t3:setup] Copied ${copied.length} .worktreeinclude entries from ${projectRoot}.`);
    run(["install", "--frozen-lockfile", "--prefer-offline"]);
    run(["exec", "turbo", "run", "build", "--filter=./packages/*"]);
    const ports = portsFor(worktree);
    const args = ["--web", String(ports.web), "--api", String(ports.api)];
    console.log(`[t3:setup] ${runWorktreeEnv(args, worktree)}`);
    run(["ai:install", "--auto"]);
  } catch (error) {
    console.error(`[t3:setup] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
