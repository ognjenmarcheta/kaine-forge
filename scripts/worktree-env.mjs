#!/usr/bin/env node
/* global console, process */
// Gives a linked worktree its own web and API ports, so several worktrees can run
// `pnpm dev` side by side. The worktrunk pre-start hook (.config/wt.toml) runs it with
// ports from `hash_port`; it also works by hand in a plain-git worktree.
//
//   node scripts/worktree-env.mjs --web <port> --api <port>
//
// It rewrites only this worktree's .env, never the primary checkout's.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

/** Keys whose loopback URLs point at the web or API dev server. */
export const URL_KEYS = [
  "BETTER_AUTH_URL",
  "API_URL",
  "WEB_APP_URL",
  "API_CORS_ORIGINS",
  "VITE_API_PROXY_TARGET",
  "VITE_API_URL",
  "VITE_GRAPHQL_URL",
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_GRAPHQL_URL"
];

const DEFAULT_PORTS = { web: 3000, api: 4000 };

/** @param {string} contents @param {string} key */
const readValue = (contents, key) =>
  new RegExp(`^${key}=(.*)$`, "m").exec(contents)?.[1]?.trim() ?? "";

/** @param {string} contents @param {string} key @param {string} value */
const setValue = (contents, key, value) => {
  const line = new RegExp(`^${key}=.*$`, "m");
  if (line.test(contents)) return contents.replace(line, `${key}=${value}`);
  return `${contents}${contents.endsWith("\n") || contents === "" ? "" : "\n"}${key}=${value}\n`;
};

/**
 * Moves the web and API dev servers to new ports. Loopback URLs on the current ports
 * (WEB_PORT/API_PORT, or 3000/4000 when unset) follow; other hosts stay as they are.
 * Running it again with the same ports changes nothing.
 * @param {string} contents .env text
 * @param {{ web: number, api: number }} ports
 * @returns {string}
 */
export function rewriteWorktreeEnv(contents, ports) {
  const current = {
    web: Number(readValue(contents, "WEB_PORT")) || DEFAULT_PORTS.web,
    api: Number(readValue(contents, "API_PORT")) || DEFAULT_PORTS.api
  };
  let next = contents;
  for (const key of URL_KEYS) {
    const value = readValue(next, key);
    if (!value) continue;
    const moved = value.replace(/\b(localhost|127\.0\.0\.1):(\d+)\b/g, (match, host, port) =>
      Number(port) === current.web
        ? `${host}:${ports.web}`
        : Number(port) === current.api
          ? `${host}:${ports.api}`
          : match
    );
    next = setValue(next, key, moved);
  }
  next = setValue(next, "WEB_PORT", String(ports.web));
  return setValue(next, "API_PORT", String(ports.api));
}

/** @param {string} cwd */
const gitPath = (cwd, flag) =>
  resolve(cwd, execFileSync("git", ["rev-parse", flag], { cwd, encoding: "utf8" }).trim());

/** True in a linked worktree, false in the primary checkout. @param {string} cwd */
export const isLinkedWorktree = (cwd) =>
  gitPath(cwd, "--git-dir") !== gitPath(cwd, "--git-common-dir");

/** @param {string | undefined} raw @param {string} name */
const parsePort = (raw, name) => {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--${name} needs a port number from 1 to 65535, got ${raw ?? "nothing"}.`);
  }
  return port;
};

/**
 * @param {string[]} argv
 * @param {string} root worktree root that holds .env
 * @returns {string} what changed
 */
export function runWorktreeEnv(argv, root) {
  const { values } = parseArgs({
    args: argv,
    options: { web: { type: "string" }, api: { type: "string" } }
  });
  const ports = { web: parsePort(values.web, "web"), api: parsePort(values.api, "api") };
  if (ports.web === ports.api) throw new Error("--web and --api need different ports.");
  if (!isLinkedWorktree(root)) {
    throw new Error(
      "This is the primary checkout. Run worktree:env only in a linked worktree, so the main .env keeps ports 3000 and 4000."
    );
  }
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    execFileSync(process.execPath, [join(root, "scripts", "ensure-env.mjs")], {
      cwd: root,
      stdio: "inherit"
    });
  }
  const contents = readFileSync(envPath, "utf8");
  const next = rewriteWorktreeEnv(contents, ports);
  if (next === contents) return `.env already uses web ${ports.web} and API ${ports.api}.`;
  writeFileSync(envPath, next);
  return `.env now uses web ${ports.web} and API ${ports.api}.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    console.log(`[worktree:env] ${runWorktreeEnv(process.argv.slice(2), root)}`);
  } catch (error) {
    console.error(`[worktree:env] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
