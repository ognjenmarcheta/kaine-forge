/* global URL, process */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./check-public-text.mjs", import.meta.url));

// Paths are joined at run time so this file never holds one the check would flag.
const LINUX_HOME = ["", "home", "ana", "src", "app"].join("/");
const MAC_HOME = ["", "Users", "ana", "src"].join("/");
const WINDOWS_HOME = ["C:", "Users", "ana", "src"].join("\\");
const WORKTREE = ["repo", ".claude", "worktrees", "feature-x", "file.ts"].join("/");

/** @param {string} cwd @param {string[]} args */
function run(cwd, ...args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    stdout: result.stdout
  };
}

/** @param {string} cwd @param {string[]} args */
function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** @param {string} dir @param {string} file @param {string} text @param {string} message */
function commit(dir, file, text, message) {
  writeFileSync(join(dir, file), text);
  git(dir, "add", file);
  git(dir, "commit", "-q", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}

/**
 * A repo with one base commit and a hash list made with the real --hash command.
 * @param {string[]} names
 */
function makeRepo(names) {
  const dir = mkdtempSync(join(tmpdir(), "public-text-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "dev@example.com");
  git(dir, "config", "user.name", "Dev");
  git(dir, "config", "commit.gpgsign", "false");
  const base = commit(dir, "README.md", "# Demo\n", "chore: base");
  mkdirSync(join(dir, ".github"));
  const hashes = names.map((name) => run(dir, "--hash", name).stdout.trim());
  writeFileSync(
    join(dir, ".github", "public-text-hashes.json"),
    JSON.stringify({ version: 1, hashes })
  );
  return { dir, base };
}

describe("check-public-text", () => {
  /** @type {{ dir: string, base: string }} */
  let repo;
  before(() => {
    repo = makeRepo(["Zorblax", "Quill Harbor"]);
  });
  after(() => rmSync(repo.dir, { recursive: true, force: true }));

  it("finds a listed word in an added line and does not print it", () => {
    const sha = commit(
      repo.dir,
      "notes.md",
      "# Notes\nWe ship ZORBLAX today.\n",
      "docs: add notes"
    );
    const result = run(repo.dir, "--from", repo.base, "--to", sha);
    assert.equal(result.status, 1);
    assert.match(result.output, /notes\.md:2: a listed name/);
    assert.doesNotMatch(result.output, /zorblax/i);
  });

  it("finds a listed two-word name in the PR title but not either word alone", () => {
    const listed = run(
      repo.dir,
      "--from",
      repo.base,
      "--to",
      repo.base,
      "--pr-title=Sync with quill-harbor"
    );
    assert.equal(listed.status, 1);
    assert.match(listed.output, /PR title: a listed name/);

    const apart = run(
      repo.dir,
      "--from",
      repo.base,
      "--to",
      repo.base,
      "--pr-title=Quill the harbor"
    );
    assert.equal(apart.status, 0);
  });

  it("finds a listed word in a commit message", () => {
    const sha = commit(repo.dir, "plain.md", "plain\n", "docs: plain\n\nAsked by Zorblax.");
    const result = run(repo.dir, "--from", `${sha}~1`, "--to", sha);
    assert.equal(result.status, 1);
    assert.match(
      result.output,
      new RegExp(`${sha.slice(0, 10)} commit message line 3: a listed name`)
    );
  });

  for (const [label, text, kind] of [
    ["a Linux home path", `see ${LINUX_HOME}`, "a local home path"],
    ["a macOS home path", `"${MAC_HOME}"`, "a local home path"],
    ["a Windows home path", `at ${WINDOWS_HOME}`, "a local home path"],
    ["a worktree path", WORKTREE, "a local worktree path"]
  ]) {
    it(`finds ${label} in the PR body`, () => {
      const body = join(repo.dir, "pr-body.md");
      writeFileSync(body, `## Summary\n\n${text}\n`);
      const result = run(repo.dir, "--from", repo.base, "--to", repo.base, "--pr-body-file", body);
      assert.equal(result.status, 1);
      assert.match(result.output, new RegExp(`PR body line 3: ${kind}`));
      assert.equal(result.output.includes(text), false);
    });
  }

  it("passes a clean range with generic paths and unlisted words", () => {
    const from = git(repo.dir, "rev-parse", "HEAD");
    const sha = commit(
      repo.dir,
      "guide.md",
      [
        "Clone into /home/<user>/code or /home/runner/work.",
        "Ignore .claude/worktrees/ in git.",
        "See https://example.com/users/quill/ and the harbor."
      ].join("\n"),
      "docs: add guide"
    );
    const result = run(repo.dir, "--from", from, "--to", sha);
    assert.equal(result.status, 0, result.output);
  });

  it("exits 2 when the range cannot be read", () => {
    const result = run(repo.dir, "--from", "no-such-ref", "--to", "HEAD");
    assert.equal(result.status, 2);
    assert.match(result.output, /Cannot read the range/);
  });

  it("refuses to hash text the check can never match", () => {
    const result = run(repo.dir, "--hash", "three word name");
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
  });
});
