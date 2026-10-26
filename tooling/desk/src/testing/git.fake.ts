import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  isGitBranchName,
  type DiffResult,
  type GitPort,
  type RefsSnapshot,
  type WorktreeEntry
} from "../git";

/**
 * A git that lives in memory plus plain directories. Process starts are slow
 * on some machines (about 80 ms each), and one pipeline run needs dozens of
 * git calls, so most pipeline tests use this fake. A few tests use real git to
 * prove the same invariants end to end.
 *
 * The model: a worktree is a directory. Its baseline is the set of files at
 * creation. The diff against the base is every file that is new, changed or
 * gone since then. HEAD, the branch, refs and the stash are plain fields that
 * a scripted agent can change through the controls below.
 */

export const FAKE_BASE_SHA = "b".repeat(40);

interface Tree {
  readonly dir: string;
  branch: string;
  head: string;
  readonly refs: Map<string, string>;
  readonly stash: string[];
  readonly baseline: Map<string, string>;
}

const walk = async (root: string, prefix = ""): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await walk(root, relative)));
    else files.push(relative);
  }
  return files.sort();
};

const readAll = async (root: string): Promise<Map<string, string>> => {
  const files = new Map<string, string>();
  for (const file of await walk(root))
    files.set(file, await readFile(path.join(root, file), "utf8"));
  return files;
};

type Change = {
  readonly path: string;
  readonly status: "A" | "M" | "D";
  readonly before: string;
  readonly after: string;
};

const changesOf = async (tree: Tree): Promise<Change[]> => {
  const now = await readAll(tree.dir);
  const changes: Change[] = [];
  for (const [file, after] of now) {
    const before = tree.baseline.get(file);
    if (before === undefined) changes.push({ path: file, status: "A", before: "", after });
    else if (before !== after) changes.push({ path: file, status: "M", before, after });
  }
  for (const [file, before] of tree.baseline) {
    if (!now.has(file)) changes.push({ path: file, status: "D", before, after: "" });
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
};

const bodyLines = (text: string): string[] =>
  text === "" ? [] : text.replace(/\n$/, "").split("\n");

const patchOf = (changes: readonly Change[]): string =>
  changes
    .map((change) => {
      const before = bodyLines(change.before);
      const after = bodyLines(change.after);
      return [
        `diff --git a/${change.path} b/${change.path}`,
        ...(change.status === "A" ? ["new file mode 100644"] : []),
        ...(change.status === "D" ? ["deleted file mode 100644"] : []),
        `--- ${change.status === "A" ? "/dev/null" : `a/${change.path}`}`,
        `+++ ${change.status === "D" ? "/dev/null" : `b/${change.path}`}`,
        `@@ -${before.length === 0 ? "0,0" : `1,${before.length}`} +${after.length === 0 ? "0,0" : `1,${after.length}`} @@`,
        ...before.map((line) => `-${line}`),
        ...after.map((line) => `+${line}`)
      ].join("\n");
    })
    .join("\n")
    .concat(changes.length === 0 ? "" : "\n");

const STATUS = { A: "added", M: "modified", D: "deleted" } as const;

const hash = (text: string): string => createHash("sha1").update(text).digest("hex");

export interface FakeGitOptions {
  /** The main checkout. */
  readonly repoRoot: string;
  /** Files every new worktree starts with (relative path to content). */
  readonly files: Readonly<Record<string, string>>;
}

export interface FakeGit {
  readonly port: GitPort;
  /** Commit in the worktree: HEAD moves, as an agent that ran `git commit` would cause. */
  readonly commit: (worktree: string) => void;
  readonly addRef: (worktree: string, ref: string) => void;
  readonly stashPush: (worktree: string) => void;
  /** A branch that exists already in the repository. */
  readonly addBranch: (branch: string) => void;
  readonly branchOf: (worktree: string) => string | null;
  readonly trees: () => string[];
}

export const createFakeGit = (options: FakeGitOptions): FakeGit => {
  const trees = new Map<string, Tree>();
  const extraBranches = new Set<string>();

  const treeAt = (dir: string | undefined): Tree => {
    const tree = dir === undefined ? undefined : trees.get(dir);
    if (tree === undefined) throw new Error(`fake git: no worktree at ${dir ?? "(no cwd)"}`);
    return tree;
  };

  const createTree = async (dir: string, branch: string): Promise<void> => {
    await mkdir(dir, { recursive: true });
    for (const [file, content] of Object.entries(options.files)) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await writeFile(path.join(dir, file), content);
    }
    trees.set(dir, {
      dir,
      branch,
      head: FAKE_BASE_SHA,
      refs: new Map(),
      stash: [],
      baseline: await readAll(dir)
    });
  };

  const branches = (): string[] => [
    ...[...trees.values()].map((tree) => tree.branch),
    ...extraBranches
  ];

  const port: GitPort = {
    fetch: () => Promise.resolve(),
    worktreeAdd: async (_repo, request) => createTree(request.dir, request.branch),
    worktreeRemove: async (_repo, dir) => {
      // Like git, removing a worktree keeps its branch.
      const tree = trees.get(dir);
      if (tree !== undefined) extraBranches.add(tree.branch);
      trees.delete(dir);
      await rm(dir, { recursive: true, force: true });
    },
    worktreePrune: async () => {
      for (const [dir] of trees) {
        try {
          await readdir(dir);
        } catch {
          trees.delete(dir);
        }
      }
    },
    worktreeList: () =>
      Promise.resolve<readonly WorktreeEntry[]>([
        { path: options.repoRoot, branch: "main", head: FAKE_BASE_SHA },
        ...[...trees.values()].map((tree) => ({
          path: tree.dir,
          branch: tree.branch,
          head: tree.head
        }))
      ]),
    // The main checkout is not a tree of the fake: it stays at the base.
    headSha: (cwd) => Promise.resolve(cwd === options.repoRoot ? FAKE_BASE_SHA : treeAt(cwd).head),
    currentBranch: (cwd) => Promise.resolve(treeAt(cwd).branch),
    branchExists: (_repo, branch) => Promise.resolve(branches().includes(branch)),
    statusPorcelain: async (cwd) =>
      (await changesOf(treeAt(cwd))).map((change) => `?? ${change.path}\n`).join(""),
    branchRename: (cwd, from, to) => {
      const tree = treeAt(cwd);
      if (tree.branch !== from)
        return Promise.reject(new Error(`fake git: ${from} is not checked out`));
      tree.branch = to;
      return Promise.resolve();
    },
    checkRefFormat: (_cwd, branch) => Promise.resolve(isGitBranchName(branch)),
    mergeBase: () => Promise.resolve(FAKE_BASE_SHA),
    isAncestor: () => Promise.resolve(true),
    refsSnapshot: (cwd) => {
      const tree = treeAt(cwd);
      const snapshot: RefsSnapshot = {
        head: tree.head,
        branch: tree.branch,
        refs: {
          [`refs/heads/${tree.branch}`]: tree.head,
          "refs/remotes/origin/main": FAKE_BASE_SHA,
          ...Object.fromEntries(tree.refs)
        },
        remotes: { "remote.origin.url": "https://example.test/repo.git" },
        stash: [...tree.stash]
      };
      return Promise.resolve(snapshot);
    },
    diffAgainstBase: async (worktree): Promise<DiffResult> => {
      const changes = await changesOf(treeAt(worktree));
      const patch = patchOf(changes);
      return {
        patch,
        files: changes.map((change) => ({ status: STATUS[change.status], path: change.path })),
        diffHash: createHash("sha256").update(patch).digest("hex")
      };
    }
  };

  return {
    port,
    commit: (worktree) => {
      const tree = treeAt(worktree);
      tree.head = hash(`${tree.head}:commit`);
    },
    addRef: (worktree, ref) => {
      const tree = treeAt(worktree);
      tree.refs.set(ref, tree.head);
    },
    stashPush: (worktree) => {
      treeAt(worktree).stash.push(hash("stash"));
    },
    addBranch: (branch) => {
      extraBranches.add(branch);
    },
    branchOf: (worktree) => trees.get(worktree)?.branch ?? null,
    trees: () => [...trees.keys()]
  };
};
