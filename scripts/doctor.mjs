#!/usr/bin/env node
/* global console, process */
// Local environment preflight for bootstrap / quick-setup.
// Pure Node (no workspace deps) so it can run before `pnpm install`.
// AI scaffold health remains `pnpm ai:doctor`.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const TROUBLESHOOTING = "docs/troubleshooting.md";

/** @typedef {{ ok: boolean, name: string, detail: string, remediation?: string }} CheckResult */

/**
 * Parse a simple `>=N` or `>=N.M` engines.node range (what this repo uses).
 * @param {string} range
 * @param {string} version e.g. process.version without leading v, or with it
 */
export function nodeSatisfiesEngine(range, version) {
  const actual = version.replace(/^v/, "");
  const match = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(range.trim());
  if (!match) {
    return { ok: false, reason: `unsupported engines.node range: ${range}` };
  }
  const minMajor = Number(match[1]);
  const minMinor = Number(match[2] ?? 0);
  const minPatch = Number(match[3] ?? 0);
  const [maj, min, pat] = actual.split(".").map((p) => Number(p));
  if ([maj, min, pat].some((n) => Number.isNaN(n))) {
    return { ok: false, reason: `unparseable node version: ${version}` };
  }
  const ok =
    maj > minMajor ||
    (maj === minMajor && min > minMinor) ||
    (maj === minMajor && min === minMinor && pat >= minPatch);
  return ok ? { ok: true } : { ok: false, reason: `need ${range}, found ${actual}` };
}

/**
 * @param {string} packageManagerField e.g. pnpm@10.29.3
 * @param {string} installed e.g. 10.29.3
 */
export function pnpmMatchesPackageManager(packageManagerField, installed) {
  const expected = packageManagerField.replace(/^pnpm@/, "").trim();
  const actual = installed.trim().replace(/^v/, "");
  if (!expected) {
    return { ok: false, reason: "packageManager field missing pnpm version" };
  }
  return actual === expected
    ? { ok: true }
    : { ok: false, reason: `need pnpm@${expected}, found ${actual}` };
}

/**
 * Required non-empty keys for a usable local .env (subset of .env.example).
 */
export const REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "API_PORT",
  "API_URL"
];

/**
 * @param {string} envContents
 * @param {string[]} keys
 */
export function missingEnvKeys(envContents, keys = REQUIRED_ENV_KEYS) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const line of envContents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    map[key] = value;
  }
  return keys.filter((key) => !map[key]);
}

/** Default host ports used by compose + local web/api. */
export const CHECK_PORTS = [
  { port: 5432, label: "Postgres", section: "Native Postgres on port 5432 shadows Compose" },
  { port: 9000, label: "MinIO API", section: "MinIO ports 9000/9001 already in use" },
  { port: 9001, label: "MinIO console", section: "MinIO ports 9000/9001 already in use" },
  { port: 3000, label: "Web (Vite)", section: "Ports reference (defaults)" },
  { port: 4000, label: "API", section: "Ports reference (defaults)" }
];

/**
 * Parse top-level quoted label keys from `.github/labeler.yml` content.
 * Only column-0 `"name":` entries count; nested mapping keys are indented.
 * Kept regex-based so doctor stays dependency-free (no YAML parser).
 * @param {string} yamlContent
 * @returns {string[]}
 */
export function labelerLabelNames(yamlContent) {
  const names = [];
  const re = /^"([^"]+)":/gm;
  let match;
  while ((match = re.exec(yamlContent)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/**
 * Labels referenced by labeler config but absent from the issue tracker.
 * @param {string[]} labelerLabels
 * @param {string[]} trackerLabels
 * @returns {string[]}
 */
export function missingTrackerLabels(labelerLabels, trackerLabels) {
  const known = new Set(trackerLabels);
  return labelerLabels.filter((label) => !known.has(label));
}

const DAY_MS = 86_400_000;

/**
 * Whole days elapsed since the coverage summary was written.
 * @param {number} mtimeMs
 * @param {number} nowMs
 * @returns {number}
 */
export function coverageSummaryAgeDays(mtimeMs, nowMs) {
  return Math.floor((nowMs - mtimeMs) / DAY_MS);
}

/** Coverage evidence older than this is flagged as stale (informational). */
export const COVERAGE_MAX_AGE_DAYS = 14;

/**
 * @param {number} port
 * @param {string} host
 * @returns {Promise<boolean>} true if something accepts connections
 */
export function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const done = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(400);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/**
 * @param {number} port
 * @returns {string | null}
 */
function lsofPortHint(port) {
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const line = out.split("\n").find((l) => l && !l.startsWith("COMMAND"));
    return line ? line.trim() : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 */
function runQuiet(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

/**
 * @returns {CheckResult}
 */
function checkNode() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const range = pkg.engines?.node ?? ">=22";
  const result = nodeSatisfiesEngine(range, process.version);
  if (!result.ok) {
    return {
      ok: false,
      name: "Node.js",
      detail: result.reason ?? "version mismatch",
      remediation: `Install Node ${range} (see package.json engines). nvm/fnm/asdf are fine.`
    };
  }
  return { ok: true, name: "Node.js", detail: `${process.version} satisfies ${range}` };
}

/**
 * @returns {CheckResult}
 */
function checkPnpm() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const field = pkg.packageManager ?? "pnpm@10.29.3";
  const probe = runQuiet("pnpm", ["--version"]);
  if (probe.error || probe.status !== 0) {
    return {
      ok: false,
      name: "pnpm",
      detail: "pnpm not found on PATH",
      remediation: `Enable Corepack or install ${field}: corepack enable && corepack prepare ${field} --activate`
    };
  }
  const installed = (probe.stdout || "").trim();
  const result = pnpmMatchesPackageManager(field, installed);
  if (!result.ok) {
    return {
      ok: false,
      name: "pnpm",
      detail: result.reason ?? "version mismatch",
      remediation: `corepack prepare ${field} --activate`
    };
  }
  return { ok: true, name: "pnpm", detail: `${installed} matches ${field}` };
}

/**
 * @returns {CheckResult}
 */
function checkDocker() {
  const probe = runQuiet("docker", ["info"]);
  if (probe.error) {
    return {
      ok: false,
      name: "Docker",
      detail: "docker CLI not found on PATH",
      remediation: `Install Docker Desktop (or an engine) and ensure \`docker\` is on PATH. See ${TROUBLESHOOTING} § "Docker daemon not running".`
    };
  }
  if (probe.status !== 0) {
    const stderr = (probe.stderr || "").trim().split("\n").slice(-3).join(" ");
    return {
      ok: false,
      name: "Docker",
      detail: stderr || "docker info failed",
      remediation: `Start the Docker daemon, then retry. See ${TROUBLESHOOTING} § "Docker daemon not running".`
    };
  }
  return { ok: true, name: "Docker", detail: "daemon reachable (docker info)" };
}

/**
 * Ports may be free (ok) or in use (ok with note — compose/dev may own them).
 * We only fail when we cannot decide; occupancy is informational so shadowing
 * is visible before a confusing auth error from the wrong Postgres.
 * @returns {Promise<CheckResult>}
 */
async function checkPorts() {
  /** @type {string[]} */
  const notes = [];
  for (const { port, label, section } of CHECK_PORTS) {
    const open = await isPortOpen(port);
    if (!open) {
      notes.push(`${port} (${label}): free`);
      continue;
    }
    const owner = lsofPortHint(port);
    notes.push(
      owner
        ? `${port} (${label}): in use — ${owner}`
        : `${port} (${label}): in use (could not identify process)`
    );
    if (port === 5432 || port === 9000 || port === 9001) {
      notes.push(`  → if unexpected, see ${TROUBLESHOOTING} § "${section}"`);
    }
  }
  return {
    ok: true,
    name: "Ports",
    detail: notes.join("\n         ")
  };
}

/**
 * @returns {CheckResult}
 */
function checkEnv() {
  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) {
    // Missing .env is fine before env:ensure; bootstrap creates it next.
    return {
      ok: true,
      name: ".env",
      detail: "absent (ok — run `pnpm env:ensure` / bootstrap will create it)"
    };
  }
  const contents = readFileSync(envPath, "utf8");
  const missing = missingEnvKeys(contents);
  if (missing.length > 0) {
    return {
      ok: false,
      name: ".env",
      detail: `missing or empty: ${missing.join(", ")}`,
      remediation: `Fill required keys from .env.example. See ${TROUBLESHOOTING} and README onboarding.`
    };
  }
  // Soft warn on placeholder secret
  if (/BETTER_AUTH_SECRET=your-secret-key/m.test(contents)) {
    return {
      ok: false,
      name: ".env",
      detail: "BETTER_AUTH_SECRET still looks like the .env.example placeholder",
      remediation: "Regenerate: delete .env and run `pnpm env:ensure`, or set a strong secret."
    };
  }
  return {
    ok: true,
    name: ".env",
    detail: `present with required keys (${REQUIRED_ENV_KEYS.join(", ")})`
  };
}

/**
 * Optional: only when --with-db is passed (after compose is up).
 * @returns {Promise<CheckResult>}
 */
async function checkPostgres() {
  const envPath = join(repoRoot, ".env");
  let databaseUrl =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/monorepo_dev";
  if (existsSync(envPath)) {
    const contents = readFileSync(envPath, "utf8");
    const m = /^DATABASE_URL=(.+)$/m.exec(contents);
    if (m) databaseUrl = m[1].trim();
  }
  let host = "127.0.0.1";
  let port = 5432;
  try {
    const u = new URL(databaseUrl);
    host = u.hostname || host;
    port = u.port ? Number(u.port) : 5432;
  } catch {
    return {
      ok: false,
      name: "Postgres",
      detail: `could not parse DATABASE_URL`,
      remediation: `Fix DATABASE_URL in .env. See ${TROUBLESHOOTING}.`
    };
  }
  const open = await isPortOpen(port, host);
  if (!open) {
    return {
      ok: false,
      name: "Postgres",
      detail: `nothing listening on ${host}:${port}`,
      remediation: `Start compose: \`docker compose up -d --wait\`. See ${TROUBLESHOOTING} § "Docker daemon not running". Full DB create still runs via \`pnpm db:ensure\`.`
    };
  }
  return {
    ok: true,
    name: "Postgres",
    detail: `${host}:${port} accepts TCP (schema/auth still validated by db:ensure)`
  };
}

/**
 * Labeler labels must exist in the issue tracker, or `gh pr create --label`
 * and the PR labeler workflow fail at use time. Skips gracefully when gh is
 * unavailable (doctor also runs before install on fresh machines).
 * @returns {CheckResult}
 */
function checkTrackerLabels() {
  const labelerPath = join(repoRoot, ".github", "labeler.yml");
  if (!existsSync(labelerPath)) {
    return { ok: true, name: "Tracker labels", detail: "labeler.yml absent (skipped)" };
  }
  const probe = runQuiet("gh", ["label", "list", "--limit", "200"]);
  if (probe.error || probe.status !== 0) {
    return {
      ok: true,
      name: "Tracker labels",
      detail: "skipped (gh CLI unavailable or not authenticated)"
    };
  }
  const trackerLabels = (probe.stdout || "")
    .split("\n")
    .map((line) => line.split("\t")[0].trim())
    .filter(Boolean);
  const labelerLabels = labelerLabelNames(readFileSync(labelerPath, "utf8"));
  const missing = missingTrackerLabels(labelerLabels, trackerLabels);
  if (missing.length > 0) {
    return {
      ok: false,
      name: "Tracker labels",
      detail: `labeler.yml references labels missing from the tracker: ${missing.join(", ")}`,
      remediation: missing.map((label) => `gh label create "${label}" --color ededed`).join(" · ")
    };
  }
  return {
    ok: true,
    name: "Tracker labels",
    detail: `${labelerLabels.length} labeler labels all exist in tracker`
  };
}

/**
 * Coverage evidence goes stale once CI stops producing it; stale floors are
 * informational here — never a bootstrap failure.
 * @returns {CheckResult}
 */
function checkCoverageFreshness() {
  const summaryPath = join(repoRoot, "coverage", "coverage-summary.json");
  if (!existsSync(summaryPath)) {
    return {
      ok: true,
      name: "Coverage data",
      detail: "absent (run `pnpm coverage` when you need floor evidence)"
    };
  }
  const ageDays = coverageSummaryAgeDays(statSync(summaryPath).mtimeMs, Date.now());
  if (ageDays > COVERAGE_MAX_AGE_DAYS) {
    return {
      ok: true,
      name: "Coverage data",
      detail: `${ageDays} days old (> ${COVERAGE_MAX_AGE_DAYS}) — run \`pnpm coverage\` before trusting floors`
    };
  }
  return { ok: true, name: "Coverage data", detail: `${ageDays} days old` };
}

function printResult(result) {
  const icon = result.ok ? "ok" : "FAIL";
  console.log(`[doctor] ${icon.padEnd(4)} ${result.name}: ${result.detail}`);
  if (!result.ok && result.remediation) {
    console.log(`[doctor]      → ${result.remediation}`);
  }
}

async function main() {
  const withDb = process.argv.includes("--with-db");
  console.log("[doctor] Environment preflight (AI scaffold: pnpm ai:doctor)");
  console.log(`[doctor] Repo: ${repoRoot}`);

  /** @type {CheckResult[]} */
  const results = [];
  results.push(checkNode());
  results.push(checkPnpm());
  results.push(checkDocker());
  results.push(await checkPorts());
  results.push(checkEnv());
  results.push(checkTrackerLabels());
  results.push(checkCoverageFreshness());
  if (withDb) {
    results.push(await checkPostgres());
  }

  for (const r of results) printResult(r);

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(
      `[doctor] ${failed.length} check(s) failed. See ${TROUBLESHOOTING} for local setup failures.`
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    withDb
      ? "[doctor] All checks passed."
      : "[doctor] All checks passed. (DB TCP probe: re-run with --with-db after compose is up.)"
  );
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("[doctor] unexpected error", err);
    process.exitCode = 1;
  });
}
