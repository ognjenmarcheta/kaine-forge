#!/usr/bin/env node
/* global console, process */
// Blocks private names and local paths in the text a change publishes: commit
// messages, added diff lines, and the PR title and body. The names are listed
// only as salted SHA-256 digests in .github/public-text-hashes.json, so the repo
// never stores them in plain text. Findings say where and what kind, never the
// matched text.
//
//   node scripts/check-public-text.mjs [--from <ref>] [--to <ref>]
//     [--pr-title=<text>] [--pr-body-file <path>]
//   node scripts/check-public-text.mjs --hash "<name>"
//
// Exit 0: clean. Exit 1: findings. Exit 2: bad input, or the range cannot be read.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const SALT = "kaine-public-text:v1:";
const HASH_FILE = ".github/public-text-hashes.json";
const DIGEST = /^[0-9a-f]{64}$/;

const WORD = /[\p{L}\p{N}]+/gu;
const COMPOUND = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)+/gu;
const DOTTED = /[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;

// A home path needs a real username segment after it, so `/home/<user>/` in docs
// and URL paths such as `example.com/users/x/` do not match.
const HOME_PATH = /(?<![\w.-])(?:\/home\/|\/Users\/|[a-z]:\\+Users\\+)([\w.-]+)[\\/]/gi;
// Generic names that docs, fixtures, and CI runners use in place of a real user.
const PLACEHOLDER_USERS = new Set([
  "dev",
  "example",
  "me",
  "name",
  "node",
  "root",
  "runner",
  "someone",
  "test",
  "ubuntu",
  "user",
  "username",
  "you"
]);
const WORKTREE_PATH = /\.claude[\\/]+worktrees[\\/]+[\w.-]+/i;

/** @param {string} text */
function normalize(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** @param {string} text */
function digest(text) {
  return createHash("sha256")
    .update(SALT + normalize(text))
    .digest("hex");
}

/**
 * Every listable form in one line: each word, each adjacent word pair, each
 * hyphenated compound, and each dotted name (a hostname) whole and as its last
 * two labels.
 * @param {string} line
 */
function candidates(line) {
  const lower = line.toLowerCase();
  const words = lower.match(WORD) ?? [];
  const found = new Set(words);
  for (let index = 1; index < words.length; index += 1) {
    found.add(`${words[index - 1]} ${words[index]}`);
  }
  for (const compound of lower.match(COMPOUND) ?? []) found.add(compound);
  for (const dotted of lower.match(DOTTED) ?? []) {
    found.add(dotted);
    found.add(dotted.split(".").slice(-2).join("."));
  }
  return found;
}

/**
 * @param {string} line
 * @param {Set<string>} hashes
 * @returns {string[]} the kinds of finding in the line
 */
function findKinds(line, hashes) {
  const kinds = [];
  if (hashes.size > 0 && [...candidates(line)].some((item) => hashes.has(digest(item)))) {
    kinds.push("a listed name");
  }
  for (const match of line.matchAll(HOME_PATH)) {
    if (!PLACEHOLDER_USERS.has((match[1] ?? "").toLowerCase())) {
      kinds.push("a local home path");
      break;
    }
  }
  if (WORKTREE_PATH.test(line)) kinds.push("a local worktree path");
  return kinds;
}

/** @param {string} root */
function loadHashes(root) {
  let raw;
  try {
    raw = readFileSync(join(root, HASH_FILE), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return new Set();
    throw error;
  }
  /** @type {unknown} */
  const parsed = JSON.parse(raw);
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("version" in parsed) ||
    parsed.version !== 1 ||
    !("hashes" in parsed) ||
    !Array.isArray(parsed.hashes) ||
    !parsed.hashes.every((item) => typeof item === "string" && DIGEST.test(item))
  ) {
    throw new Error(`${HASH_FILE} must be { "version": 1, "hashes": [<64-char hex digests>] }.`);
  }
  return new Set(parsed.hashes);
}

/** @param {string[]} args */
function git(...args) {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

/**
 * Added lines of one commit with their file and line, skipping the hash list.
 * Binary files have no `+` lines in a patch, so they drop out on their own.
 * @param {string} sha
 */
function addedLines(sha) {
  const patch = git(
    "diff-tree",
    "--root",
    "-r",
    "-M",
    "-p",
    "-U0",
    "--no-color",
    "--no-ext-diff",
    sha
  );
  /** @type {{ file: string, line: number, text: string }[]} */
  const lines = [];
  let file = "";
  let next = 0;
  let inHunk = false;
  for (const row of patch.split("\n")) {
    if (row.startsWith("diff --git ")) {
      inHunk = false;
    } else if (!inHunk && row.startsWith("+++ ")) {
      file = row.slice(4).replace(/^b\//, "");
    } else if (row.startsWith("@@ ")) {
      inHunk = true;
      next = Number(/\+(\d+)/.exec(row)?.[1] ?? 0);
    } else if (inHunk && row.startsWith("+")) {
      if (file !== HASH_FILE) lines.push({ file, line: next, text: row.slice(1) });
      next += 1;
    }
  }
  return lines;
}

/**
 * @param {{ from: string, to: string, prTitle?: string, prBody?: string }} input
 * @param {Set<string>} hashes
 * @returns {{ findings: string[], commits: number }}
 */
function scan(input, hashes) {
  /** @type {string[]} */
  const findings = [];
  /** @param {string} where @param {string} text */
  const check = (where, text) => {
    for (const kind of findKinds(text, hashes)) findings.push(`${where}: ${kind}`);
  };

  const shas = git("rev-list", "--reverse", `${input.from}..${input.to}`)
    .split("\n")
    .filter(Boolean);
  for (const sha of shas) {
    const short = sha.slice(0, 10);
    const message = git("log", "-1", "--format=%B", sha);
    message
      .split("\n")
      .forEach((line, index) => check(`${short} commit message line ${index + 1}`, line));
    for (const added of addedLines(sha)) check(`${short} ${added.file}:${added.line}`, added.text);
  }
  if (input.prTitle !== undefined) check("PR title", input.prTitle);
  if (input.prBody !== undefined) {
    input.prBody.split(/\r?\n/).forEach((line, index) => check(`PR body line ${index + 1}`, line));
  }
  return { findings: [...new Set(findings)], commits: shas.length };
}

/** @param {string} ref */
function verifyRef(ref) {
  try {
    git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
  } catch {
    throw new Error(
      `Cannot read the range: "${ref}" is not a commit here. Fetch it, or pass --from/--to.`
    );
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      from: { type: "string", default: "origin/main" },
      to: { type: "string", default: "HEAD" },
      hash: { type: "string" },
      "pr-title": { type: "string" },
      "pr-body-file": { type: "string" }
    }
  });

  if (values.hash !== undefined) {
    const name = normalize(values.hash);
    if (name === "" || !candidates(name).has(name)) {
      throw new Error(
        "List one word, two words, a hyphenated name, or a hostname. The check never matches longer text."
      );
    }
    console.log(digest(name));
    console.error(`Add this digest to "hashes" in ${HASH_FILE}.`);
    return 0;
  }

  verifyRef(values.from);
  verifyRef(values.to);
  const root = git("rev-parse", "--show-toplevel").trim();
  const hashes = loadHashes(root);
  const prBody =
    values["pr-body-file"] === undefined ? undefined : readFileSync(values["pr-body-file"], "utf8");
  const { findings, commits } = scan(
    { from: values.from, to: values.to, prTitle: values["pr-title"], prBody },
    hashes
  );

  if (findings.length === 0) {
    console.log(`Public text is clean (${commits} commits in ${values.from}..${values.to}).`);
    return 0;
  }
  console.error(`Public text check: ${findings.length} findings. The matched text is not printed.`);
  for (const finding of findings) console.error(`  ${finding}`);
  console.error(
    "Remove the text from the file, commit message, or PR. Rewrite the commits that added it: a later commit does not remove it from history."
  );
  return 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
