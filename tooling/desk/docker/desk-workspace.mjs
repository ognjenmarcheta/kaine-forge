import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import console from "node:console";

// Workspace operations inside a throwaway container. The host never mounts the
// worktree: it sends a bundle of the base commit, the work-in-progress patch and
// the agent files as a read-only folder, and it reads results as JSON on stdout.
//
//   sync     make /workspace equal to base + patch, and record a checkpoint
//   diff     the patch since the checkpoint (or the base), with the diff hash
//   install  `pnpm install --offline --frozen-lockfile` from the filled store
//
// The folders default to the container layout. Tests set the DESK_* variables.
const ROOT = process.env.DESK_WORKSPACE_ROOT ?? "/workspace";
const INPUT = process.env.DESK_INPUT_ROOT ?? "/desk/in";
const STATE = process.env.DESK_STATE_ROOT ?? "/state";
const STORE = process.env.DESK_STORE_ROOT ?? "/store";
const LIMIT = 256 * 1024 * 1024;

// The repository in the volume is written by an agent. Its config must not start
// programs while the helper reads it (fsmonitor, hooks, pager).
const SAFE = [
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.pager=cat"
];

function git(args, options = {}) {
  const output = execFileSync("git", [...SAFE, ...args], {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", ...options.env },
    maxBuffer: LIMIT,
    stdio: ["ignore", "pipe", "pipe"]
  });
  return options.buffer === true ? output : output.toString("utf8").trim();
}

const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const COMMIT = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

function assertInput(input) {
  if (!COMMIT.test(input.baseSha ?? "")) throw new Error("Invalid base commit");
  if (!BRANCH.test(input.baseBranch ?? "main") || (input.baseBranch ?? "").includes(".."))
    throw new Error("Invalid base branch");
}

function commitExists(sha) {
  try {
    git(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function ensureRepository(input) {
  const bundle = path.join(INPUT, "base.bundle");
  if (!fs.existsSync(path.join(ROOT, ".git"))) {
    if (!fs.existsSync(bundle)) return "needs-bundle";
    fs.mkdirSync(ROOT, { recursive: true });
    execFileSync(
      "git",
      [...SAFE, "clone", "--quiet", "--no-checkout", "--no-hardlinks", bundle, ROOT],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    git(["remote", "remove", "origin"]);
  }
  if (!commitExists(input.baseSha)) {
    if (!fs.existsSync(bundle)) return "needs-bundle";
    git(["fetch", "--quiet", bundle, "HEAD"]);
    if (!commitExists(input.baseSha)) throw new Error("The bundle does not hold the base commit");
  }
  // `turbo --filter=...[origin/main]` compares with this ref.
  git(["update-ref", `refs/remotes/origin/${input.baseBranch ?? "main"}`, input.baseSha]);
  return "ready";
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function lockKey() {
  const parts = ["pnpm-lock.yaml", "pnpm-workspace.yaml"].map((name) => {
    const file = path.join(ROOT, name);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  });
  return sha256(parts.join("\0"));
}

const keyFile = () => path.join(ROOT, ".git", "desk-install-key");
const checkpointFile = () => path.join(ROOT, ".git", "desk-checkpoint");

/** Stage the whole tree into a scratch index and diff it. The real index stays as it is. */
function snapshot(input, { since, nameStatus }) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "desk-index-"));
  try {
    const env = { GIT_INDEX_FILE: path.join(scratch, "index") };
    git(["read-tree", input.baseSha], { env });
    git(["add", "-A"], { env });
    const tree = git(["write-tree"], { env });
    const diff = (treeish, extra) =>
      git([...input.flags, ...extra, "--binary", treeish, "--"], { env, buffer: true });
    const basePatch = diff(input.baseSha, []);
    // Equal diffs must have equal hashes on both sides, so the hash is taken over the
    // text the host reads: the UTF-8 decoding of the patch bytes.
    const hash = sha256(basePatch.toString("utf8"));
    let patch = basePatch;
    if (since === "checkpoint") {
      const saved = JSON.parse(fs.readFileSync(checkpointFile(), "utf8"));
      if (!/^[0-9a-f]{40,64}$/.test(saved.tree ?? "")) throw new Error("Invalid checkpoint");
      patch = diff(saved.tree, []);
    }
    return {
      tree,
      hash,
      patch,
      nameStatus: nameStatus
        ? git([...input.flags, "--name-status", "-z", input.baseSha, "--"], {
            env,
            buffer: true
          })
        : null
    };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function removeStateFiles(files) {
  for (const file of files ?? []) {
    const resolved = path.resolve(file);
    if (!resolved.startsWith(`${path.resolve(STATE)}${path.sep}`)) throw new Error("Invalid path");
    fs.rmSync(resolved, { force: true });
  }
}

async function readInput() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new Error("Input too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text.trim() === "" ? {} : JSON.parse(text);
}

async function main() {
  const operation = process.argv[2];
  const input = await readInput();
  if (operation === "sync" || operation === "diff") assertInput(input);
  switch (operation) {
    case "sync": {
      if (ensureRepository(input) === "needs-bundle") return { status: "needs-bundle" };
      git(["reset", "--quiet", "--hard", input.baseSha]);
      git(["clean", "--quiet", "-fd"]);
      const agentFiles = path.join(INPUT, "agent-files");
      if (fs.existsSync(agentFiles)) {
        fs.cpSync(agentFiles, ROOT, { recursive: true, force: true, dereference: false });
      }
      const patch = path.join(INPUT, "wip.patch");
      if (fs.existsSync(patch) && fs.statSync(patch).size > 0) {
        git(["apply", "--binary", "--whitespace=nowarn", patch]);
      }
      removeStateFiles(input.removeFiles);
      const taken = snapshot(input, { since: "base", nameStatus: false });
      fs.writeFileSync(checkpointFile(), JSON.stringify({ tree: taken.tree, hash: taken.hash }));
      const installed = fs.existsSync(keyFile()) ? fs.readFileSync(keyFile(), "utf8") : null;
      return {
        status: "ready",
        diffHash: taken.hash,
        checkpointTree: taken.tree,
        lockKey: lockKey(),
        installedKey: installed
      };
    }
    case "diff": {
      if (!fs.existsSync(path.join(ROOT, ".git"))) throw new Error("The workspace is empty");
      const taken = snapshot(input, {
        since: input.since === "checkpoint" ? "checkpoint" : "base",
        nameStatus: input.nameStatus === true
      });
      const maxBytes = Number.isSafeInteger(input.maxBytes) ? input.maxBytes : 8 * 1024 * 1024;
      if (taken.patch.length > maxBytes) {
        return { status: "too-large", diffHash: taken.hash, bytes: taken.patch.length };
      }
      return {
        status: "ok",
        diffHash: taken.hash,
        bytes: taken.patch.length,
        patch: taken.patch.toString("base64"),
        nameStatus: taken.nameStatus === null ? null : taken.nameStatus.toString("base64")
      };
    }
    case "install": {
      const key = lockKey();
      const child = spawn(
        "pnpm",
        ["install", "--offline", "--frozen-lockfile", "--store-dir", STORE],
        { cwd: ROOT, env: { ...process.env, CI: "true" }, stdio: ["ignore", 2, 2] }
      );
      const code = await new Promise((resolve) => {
        child.once("error", () => resolve(127));
        child.once("close", resolve);
      });
      if (code !== 0) throw new Error(`pnpm install exited with ${code}`);
      fs.writeFileSync(keyFile(), key);
      return { status: "installed", key };
    }
    default:
      throw new Error("Unknown workspace operation");
  }
}

try {
  console.log(JSON.stringify(await main()));
} catch (error) {
  console.error(error instanceof Error ? error.message : "workspace operation failed");
  process.exit(1);
}
