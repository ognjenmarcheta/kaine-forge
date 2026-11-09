import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { copyIncluded } from "./t3-worktree-setup.mjs";

const root = mkdtempSync(join(tmpdir(), "t3-worktree-setup-"));
after(() => rmSync(root, { recursive: true, force: true }));

test("copies only what .worktreeinclude lists from the project checkout into the worktree", () => {
  const project = join(root, "project");
  const worktree = join(root, "worktree");
  execFileSync("git", ["init", "-q", project]);
  const include = ".env\n.turbo/\n";
  writeFileSync(join(project, ".worktreeinclude"), include);
  writeFileSync(join(project, ".gitignore"), ".env\n.turbo/\nnode_modules/\n");
  writeFileSync(join(project, ".env"), "API_PORT=4000\n");
  mkdirSync(join(project, ".turbo"));
  writeFileSync(join(project, ".turbo", "cache.bin"), "hit");
  mkdirSync(join(project, "node_modules"));
  writeFileSync(join(project, "node_modules", "dep.js"), "");
  mkdirSync(worktree);
  writeFileSync(join(worktree, ".worktreeinclude"), include);

  assert.deepEqual(copyIncluded(project, worktree), [".env", ".turbo/"]);
  assert.equal(readFileSync(join(worktree, ".env"), "utf8"), "API_PORT=4000\n");
  assert.equal(readFileSync(join(worktree, ".turbo", "cache.bin"), "utf8"), "hit");
  assert.equal(existsSync(join(worktree, "node_modules")), false);
});
