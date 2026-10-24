#!/usr/bin/env tsx

// A `self` file of the sync manifest: imports only the other self files, node, and zod.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  dirtyPaths,
  fetchUpstream,
  mergeWithGit,
  planSync,
  readCommitFiles,
  readLocalFiles,
  readSyncManifest,
  readTemplateConfig,
  renderTemplateConfig,
  resolveBase,
  SYNC_MANIFEST_PATH,
  type SyncChange,
  TEMPLATE_CONFIG_PATH,
  writeSyncChanges
} from "./template-sync.util";

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT), "..");

interface CliOptions {
  check: boolean;
  dryRun: boolean;
  skipChecks: boolean;
  afterSelfUpdate: boolean;
  ref?: string;
  base?: string;
  target?: string;
}

const usage = `Usage:
  pnpm ai:sync [--ref <branch|tag|sha>] [--base <sha>] [--dry-run] [--skip-checks]
  pnpm ai:sync --check

Merges upstream template changes to the files listed in ${SYNC_MANIFEST_PATH}.
Project-owned files in .ai/project/ are never written.
`;

const parseArgs = (args: string[]): CliOptions => {
  const options: CliOptions = {
    check: false,
    dryRun: false,
    skipChecks: false,
    afterSelfUpdate: false
  };
  const value = (index: number, flag: string): string => {
    const next = args[index + 1];
    if (!next) throw new Error(`${flag} requires a value`);
    return next;
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    } else if (arg === "--check") options.check = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--skip-checks") options.skipChecks = true;
    else if (arg === "--after-self-update") options.afterSelfUpdate = true;
    else if (arg === "--ref") options.ref = value(index++, arg);
    else if (arg === "--base") options.base = value(index++, arg);
    else if (arg === "--target") options.target = value(index++, arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const short = (sha: string): string => sha.slice(0, 12);

const printChanges = (changes: readonly SyncChange[]): void => {
  for (const change of changes) {
    console.log(
      `  ${change.outcome.padEnd(8)} ${change.path}${change.note ? ` (${change.note})` : ""}`
    );
  }
};

const run = (command: string, args: string[]): boolean => {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  return spawnSync(command, args, { cwd: ROOT, stdio: "inherit" }).status === 0;
};

const installedAgents = (): string[] => {
  const dir = join(ROOT, ".ai.local", "installations");
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.replace(/\.json$/, ""))
    : [];
};

const runPostSyncChecks = (): boolean =>
  run("pnpm", [
    "ai:install",
    "--non-interactive",
    ...installedAgents().flatMap((agent) => ["--agent", agent])
  ]) &&
  run("pnpm", ["ai:doctor"]) &&
  run("pnpm", ["ai:typecheck"]) &&
  run("pnpm", ["ai:test"]);

const main = (): number => {
  const options = parseArgs(process.argv.slice(2));
  const configFile = join(ROOT, TEMPLATE_CONFIG_PATH);
  const config = readTemplateConfig(configFile);
  if (!config) {
    throw new Error(`Missing ${TEMPLATE_CONFIG_PATH}. Run pnpm template:adopt --write first.`);
  }

  const target =
    options.target ?? fetchUpstream(ROOT, config.upstream.url, options.ref ?? config.upstream.ref);
  let base = options.base ?? config.base;
  if (!base) {
    const guess = resolveBase(ROOT, target);
    if (!guess)
      throw new Error(
        "Cannot find the upstream commit this project started from. Pass --base <sha>."
      );
    console.log(`Base: ${short(guess.sha)} (found by ${guess.method}; pass --base to override)`);
    base = guess.sha;
  }
  base = fetchUpstream(ROOT, config.upstream.url, base);

  const manifest = readSyncManifest(ROOT, target);
  const changelog = (): string =>
    spawnSync("git", ["log", "--oneline", `${base}..${target}`, "--", ...manifest.paths], {
      cwd: ROOT,
      encoding: "utf8"
    }).stdout.trim();

  if (options.check) {
    const log = changelog();
    if (!log) {
      console.log(`AI setup is up to date with ${short(target)}.`);
      return 0;
    }
    console.log(`AI setup is behind upstream ${short(target)}:\n${log}\n\nRun pnpm ai:sync.`);
    return 1;
  }

  const baseFiles = readCommitFiles(ROOT, base, manifest.paths);
  const targetFiles = readCommitFiles(ROOT, target, manifest.paths);
  const candidates = [...new Set([...baseFiles.keys(), ...targetFiles.keys()])];
  const plan = (paths: readonly string[]): SyncChange[] =>
    planSync({
      base: baseFiles,
      target: targetFiles,
      local: readLocalFiles(ROOT, candidates),
      paths,
      adoption: config.adoption,
      merge: mergeWithGit
    });

  if (!options.afterSelfUpdate && !options.dryRun) {
    const dirty = dirtyPaths(ROOT, [...candidates, TEMPLATE_CONFIG_PATH]);
    if (dirty.length > 0) {
      throw new Error(
        `Commit or stash these files first, so sync can be undone:\n  ${dirty.join("\n  ")}`
      );
    }

    // Update the sync tool itself first, then let the new version do the rest.
    const selfChanges = plan(manifest.self);
    if (selfChanges.some((change) => change.outcome === "conflict")) {
      printChanges(selfChanges);
      throw new Error(
        "The sync tool itself conflicts with upstream. Restore it from upstream and re-run."
      );
    }
    if (selfChanges.some((change) => change.content !== undefined)) {
      writeSyncChanges(ROOT, selfChanges);
      console.log("Updated the sync tool; continuing with the new version.");
      return (
        spawnSync(
          process.execPath,
          [
            ...process.execArgv,
            SCRIPT,
            ...(options.skipChecks ? ["--skip-checks"] : []),
            "--target",
            target,
            "--base",
            base,
            "--after-self-update"
          ],
          { cwd: ROOT, stdio: "inherit" }
        ).status ?? 1
      );
    }
  }

  const changes = plan(manifest.paths);
  console.log(`Upstream ${short(base)} → ${short(target)}: ${changes.length} file change(s)`);
  printChanges(changes);
  const log = changelog();
  if (log) console.log(`\nUpstream commits:\n${log}`);

  if (options.dryRun) {
    console.log("\nDry run only. Nothing was written.");
    return 0;
  }

  writeSyncChanges(ROOT, changes);
  writeFileSync(configFile, renderTemplateConfig({ ...config, base: target }));

  const conflicts = changes.filter((change) => change.outcome === "conflict");
  if (conflicts.length > 0) {
    console.error(
      `\n${conflicts.length} file(s) have conflict markers. Resolve them, then run pnpm ai:install and pnpm ai:doctor.`
    );
    return 1;
  }
  if (options.skipChecks) return 0;
  return runPostSyncChecks() ? 0 : 1;
};

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
