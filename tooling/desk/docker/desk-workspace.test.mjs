import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import process from "node:process";
import { Buffer } from "node:buffer";
import { URL, fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./desk-workspace.mjs", import.meta.url));
const GIT_DIFF_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/git/git.diff.ts", import.meta.url)),
  "utf8"
);

// The flags are defined once, in the TypeScript. The test reads them from there, so the
// script and the host cannot drift apart.
const FLAGS = [
  ...(
    /export const DIFF_FLAGS = \[([\s\S]*?)\] as const/.exec(GIT_DIFF_SOURCE)?.[1] ?? ""
  ).matchAll(/"([^"]+)"/g)
].map((match) => match[1]);

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.test",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.test"
};
const git = (cwd, args, env = {}) =>
  execFileSync("git", args, { cwd, env: { ...process.env, ...GIT_ENV, ...env }, encoding: "utf8" });

/** A fixture: a host repo, an input folder, and empty workspace and state folders. */
const fixture = () => {
  const root = mkdtempSync(path.join(tmpdir(), "desk-workspace-test-"));
  const host = path.join(root, "host");
  mkdirSync(host);
  git(host, ["init", "--quiet", "-b", "main"]);
  writeFileSync(path.join(host, ".gitignore"), "node_modules/\n.claude/skills/\n");
  writeFileSync(path.join(host, "a.txt"), "one\n");
  writeFileSync(path.join(host, "pnpm-lock.yaml"), "lock: 1\n");
  git(host, ["add", "-A"]);
  git(host, ["commit", "--quiet", "-m", "base"]);
  const baseSha = git(host, ["rev-parse", "HEAD"]).trim();
  const input = path.join(root, "in");
  mkdirSync(input);
  const env = {
    DESK_WORKSPACE_ROOT: path.join(root, "workspace"),
    DESK_INPUT_ROOT: input,
    DESK_STATE_ROOT: path.join(root, "state"),
    DESK_STORE_ROOT: path.join(root, "store"),
    ...GIT_ENV
  };
  mkdirSync(env.DESK_STATE_ROOT);
  const payload = (extra = {}) => ({ baseSha, baseBranch: "main", flags: FLAGS, ...extra });
  const run = (operation, input_) => {
    const result = spawnSync("node", [SCRIPT, operation], {
      input: JSON.stringify(input_),
      env: { ...process.env, ...env },
      encoding: "utf8"
    });
    return {
      code: result.status,
      stderr: result.stderr,
      json: result.status === 0 ? JSON.parse(result.stdout.trim().split("\n").at(-1)) : null
    };
  };
  /** What the host computes for the same tree: the hash the script must reproduce. */
  const hostHash = (dir) => {
    const scratch = mkdtempSync(path.join(tmpdir(), "desk-host-index-"));
    try {
      const indexEnv = { GIT_INDEX_FILE: path.join(scratch, "index") };
      git(dir, ["add", "-A"], indexEnv);
      const patch = git(dir, [...FLAGS, "--binary", baseSha, "--"], indexEnv);
      return createHash("sha256").update(patch).digest("hex");
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  };
  const bundle = () => git(host, ["bundle", "create", path.join(input, "base.bundle"), "HEAD"]);
  return {
    root,
    host,
    input,
    env,
    baseSha,
    payload,
    run,
    hostHash,
    bundle,
    workspace: env.DESK_WORKSPACE_ROOT,
    done: () => rmSync(root, { recursive: true, force: true })
  };
};

test("the diff flags are read from the TypeScript source", () => {
  assert.equal(FLAGS[0], "diff");
  assert.ok(FLAGS.includes("--full-index"));
  assert.ok(FLAGS.includes("--no-ext-diff"));
});

test("sync asks for the bundle when the workspace is empty", () => {
  const f = fixture();
  try {
    const result = f.run("sync", f.payload());
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(result.json, { status: "needs-bundle" });
  } finally {
    f.done();
  }
});

test("sync makes the workspace equal to base plus patch and reports the host's diff hash", () => {
  const f = fixture();
  try {
    // The host work in progress: an edit, a new file, a binary file, an ignored file.
    writeFileSync(path.join(f.host, "a.txt"), "two\n");
    writeFileSync(path.join(f.host, "b.bin"), Buffer.from([0, 1, 2, 255]));
    mkdirSync(path.join(f.host, "node_modules"));
    writeFileSync(path.join(f.host, "node_modules", "x.js"), "ignored\n");
    mkdirSync(path.join(f.host, ".claude", "skills", "kaine-test"), { recursive: true });
    writeFileSync(path.join(f.host, ".claude", "skills", "kaine-test", "SKILL.md"), "skill\n");
    const expectedHash = f.hostHash(f.host);
    const scratch = mkdtempSync(path.join(tmpdir(), "desk-wip-"));
    const indexEnv = { GIT_INDEX_FILE: path.join(scratch, "index") };
    git(f.host, ["add", "-A"], indexEnv);
    writeFileSync(
      path.join(f.input, "wip.patch"),
      git(f.host, [...FLAGS, "--binary", f.baseSha, "--"], indexEnv)
    );
    rmSync(scratch, { recursive: true, force: true });
    mkdirSync(path.join(f.input, "agent-files", ".claude", "skills", "kaine-test"), {
      recursive: true
    });
    writeFileSync(
      path.join(f.input, "agent-files", ".claude", "skills", "kaine-test", "SKILL.md"),
      "skill\n"
    );
    f.bundle();

    const result = f.run("sync", f.payload());
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.json.status, "ready");
    assert.equal(result.json.diffHash, expectedHash);
    assert.equal(readFileSync(path.join(f.workspace, "a.txt"), "utf8"), "two\n");
    assert.deepEqual([...readFileSync(path.join(f.workspace, "b.bin"))], [0, 1, 2, 255]);
    assert.ok(existsSync(path.join(f.workspace, ".claude", "skills", "kaine-test", "SKILL.md")));
    assert.equal(existsSync(path.join(f.workspace, "node_modules")), false);
    // `turbo --filter=...[origin/main]` compares with this ref.
    assert.equal(git(f.workspace, ["rev-parse", "refs/remotes/origin/main"]).trim(), f.baseSha);
    assert.equal(result.json.installedKey, null);
    assert.match(result.json.lockKey, /^[0-9a-f]{64}$/);
  } finally {
    f.done();
  }
});

test("diff since the checkpoint returns only what the agent changed, binary files included", () => {
  const f = fixture();
  try {
    f.bundle();
    const first = f.run("sync", f.payload());
    assert.equal(first.code, 0, first.stderr);

    // The agent: edits, adds, deletes, writes a binary file and an ignored file.
    writeFileSync(path.join(f.workspace, "a.txt"), "agent\n");
    writeFileSync(path.join(f.workspace, "new.ts"), "export {};\n");
    writeFileSync(path.join(f.workspace, "agent.bin"), Buffer.from([7, 0, 7, 255, 254]));
    mkdirSync(path.join(f.workspace, "node_modules"), { recursive: true });
    writeFileSync(path.join(f.workspace, "node_modules", "junk.js"), "x\n");
    rmSync(path.join(f.workspace, "pnpm-lock.yaml"));

    const result = f.run("diff", f.payload({ since: "checkpoint", nameStatus: true }));
    assert.equal(result.code, 0, result.stderr);
    const patch = Buffer.from(result.json.patch, "base64");
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.bytes, patch.length);

    // The patch applies to a host tree that equals the checkpoint, and then the hashes agree.
    const names = Buffer.from(result.json.nameStatus, "base64").toString("utf8").split("\0");
    assert.ok(names.includes("a.txt") && names.includes("new.ts") && names.includes("agent.bin"));
    assert.ok(!names.some((name) => name.includes("node_modules")));
    const patchFile = path.join(f.root, "out.patch");
    writeFileSync(patchFile, patch);
    git(f.host, ["apply", "--binary", patchFile]);
    assert.equal(f.hostHash(f.host), result.json.diffHash);
  } finally {
    f.done();
  }
});

test("a second sync resets the workspace to base plus patch and keeps ignored files", () => {
  const f = fixture();
  try {
    f.bundle();
    assert.equal(f.run("sync", f.payload()).code, 0);
    writeFileSync(path.join(f.workspace, "a.txt"), "dirty\n");
    writeFileSync(path.join(f.workspace, "untracked.txt"), "x\n");
    mkdirSync(path.join(f.workspace, "node_modules"), { recursive: true });
    writeFileSync(path.join(f.workspace, "node_modules", "keep.js"), "x\n");

    const again = f.run("sync", f.payload());
    assert.equal(again.code, 0, again.stderr);
    assert.equal(readFileSync(path.join(f.workspace, "a.txt"), "utf8"), "one\n");
    assert.equal(existsSync(path.join(f.workspace, "untracked.txt")), false);
    assert.ok(existsSync(path.join(f.workspace, "node_modules", "keep.js")));
    assert.equal(again.json.diffHash, f.hostHash(f.host));
  } finally {
    f.done();
  }
});

test("a repository that the agent controls cannot start a program while the helper reads it", () => {
  const f = fixture();
  try {
    f.bundle();
    assert.equal(f.run("sync", f.payload()).code, 0);
    const marker = path.join(f.root, "pwned");
    const hook = path.join(f.root, "hook.sh");
    writeFileSync(hook, `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 });
    git(f.workspace, ["config", "core.fsmonitor", hook]);
    git(f.workspace, ["config", "core.hooksPath", f.root]);
    git(f.workspace, ["config", "core.pager", `sh -c 'touch ${marker}'`]);
    writeFileSync(path.join(f.workspace, "a.txt"), "changed\n");

    const result = f.run("diff", f.payload({ since: "checkpoint" }));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(existsSync(marker), false);
    const again = f.run("sync", f.payload());
    assert.equal(again.code, 0, again.stderr);
    assert.equal(existsSync(marker), false);
  } finally {
    f.done();
  }
});

test("diff reports a patch above the limit without sending it", () => {
  const f = fixture();
  try {
    f.bundle();
    assert.equal(f.run("sync", f.payload()).code, 0);
    writeFileSync(path.join(f.workspace, "big.txt"), "x".repeat(5000));
    const result = f.run("diff", f.payload({ since: "checkpoint", maxBytes: 1000 }));
    assert.equal(result.json.status, "too-large");
    assert.equal(result.json.patch, undefined);
  } finally {
    f.done();
  }
});

test("sync removes only files under the state folder", () => {
  const f = fixture();
  try {
    f.bundle();
    const receipts = path.join(f.env.DESK_STATE_ROOT, "receipts-builder.jsonl");
    writeFileSync(receipts, "old\n");
    const ok = f.run("sync", f.payload({ removeFiles: [receipts] }));
    assert.equal(ok.code, 0, ok.stderr);
    assert.equal(existsSync(receipts), false);

    const outside = path.join(f.root, "precious.txt");
    writeFileSync(outside, "keep\n");
    for (const target of [outside, path.join(f.env.DESK_STATE_ROOT, "..", "precious.txt")]) {
      const refused = f.run("sync", f.payload({ removeFiles: [target] }));
      assert.notEqual(refused.code, 0);
    }
    assert.ok(existsSync(outside));
  } finally {
    f.done();
  }
});

test("a bad base commit or branch is refused before any change", () => {
  const f = fixture();
  try {
    assert.notEqual(f.run("sync", { ...f.payload(), baseSha: "HEAD" }).code, 0);
    assert.notEqual(f.run("sync", { ...f.payload(), baseBranch: "../x" }).code, 0);
    assert.notEqual(f.run("nope", f.payload()).code, 0);
  } finally {
    f.done();
  }
});
