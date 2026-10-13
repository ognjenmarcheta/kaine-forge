import { createHash } from "node:crypto";
import { copyFile, mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Exec } from "../ports";
import { GitError, runGit } from "./git.real";

export const DIFF_STATUSES = [
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
  "typechange"
] as const;
export type DiffStatus = (typeof DIFF_STATUSES)[number];

export interface DiffFile {
  /** The path after the change. */
  readonly path: string;
  readonly status: DiffStatus;
  /** Set for `renamed` and `copied`. */
  readonly oldPath?: string;
}

export interface DiffResult {
  /** Binary-safe patch of the worktree against `baseSha`, untracked files included. */
  readonly patch: string;
  readonly files: readonly DiffFile[];
  /** sha256 hex of `patch`. Equal diffs have equal hashes. */
  readonly diffHash: string;
}

const COMMIT_PATTERN = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/**
 * Flags that make `git diff` output depend only on content: no user prefix
 * config, no external drivers, and full object ids, because the abbreviation
 * length grows with the object count and would change the hash.
 */
export const DIFF_FLAGS = [
  "diff",
  "--cached",
  "--no-color",
  "--no-ext-diff",
  "--no-textconv",
  "--full-index",
  "--find-renames",
  "--src-prefix=a/",
  "--dst-prefix=b/"
] as const;

const STATUS_BY_LETTER: Readonly<Record<string, DiffStatus>> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "typechange"
};

/** Parse `git diff --name-status -z`: `X\0path\0` or `Rnn\0old\0new\0`. */
export const parseNameStatus = (output: string): DiffFile[] => {
  const tokens = output.split("\0");
  const files: DiffFile[] = [];
  for (let index = 0; index < tokens.length;) {
    const code = tokens[index++];
    if (code === undefined || code === "") continue;
    const status = STATUS_BY_LETTER[code.charAt(0)];
    if (status === undefined)
      throw new GitError(`Unknown diff status '${code}'`, ["git", "diff"], 0);
    if (status === "renamed" || status === "copied") {
      const oldPath = tokens[index++];
      const newPath = tokens[index++];
      if (oldPath === undefined || newPath === undefined) {
        throw new GitError("Truncated rename entry in diff output", ["git", "diff"], 0);
      }
      files.push({ path: newPath, status, oldPath });
    } else {
      const file = tokens[index++];
      if (file === undefined) {
        throw new GitError("Truncated entry in diff output", ["git", "diff"], 0);
      }
      files.push({ path: file, status });
    }
  }
  return files;
};

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/**
 * Give the copy of the index the modification time of the original.
 *
 * Git trusts a stat entry only if the entry is older than the index file. An
 * entry as new as the index is "racily clean": an edit in the same second can
 * keep the same size and time, so git compares the content instead. A fresh
 * copy has a newer time than every entry, so git would trust the stale stat
 * data and miss such an edit. The whole second is enough: git compares seconds
 * (and nanoseconds on some builds), and an earlier time only makes git compare
 * more entries by content.
 */
const keepIndexTime = async (from: string, to: string): Promise<void> => {
  const { atimeMs, mtimeMs } = await stat(from);
  await utimes(to, Math.floor(atimeMs / 1000), Math.floor(mtimeMs / 1000));
};

/**
 * Diff the worktree (tracked and untracked, not ignored) against `baseSha`.
 *
 * It stages into a temporary copy of the index selected with
 * `GIT_INDEX_FILE`, so the real index, the refs and the working files stay as
 * they are. Staging does write blob objects for new files; they are
 * unreachable and git collects them later.
 */
export const diffAgainstBase = async (
  exec: Exec,
  worktree: string,
  baseSha: string
): Promise<DiffResult> => {
  if (!COMMIT_PATTERN.test(baseSha)) {
    throw new RangeError(`Base must be a full commit hash, got '${baseSha}'`);
  }
  const realIndex = (
    await runGit(exec, worktree, ["rev-parse", "--path-format=absolute", "--git-path", "index"])
  ).stdout.trim();

  const scratch = await mkdtemp(path.join(tmpdir(), "desk-index-"));
  try {
    const index = path.join(scratch, "index");
    // Start from the real index so unchanged files keep their stat cache.
    await copyFile(realIndex, index).then(
      () => keepIndexTime(realIndex, index),
      (error: unknown) => {
        if (!isMissing(error)) throw error;
      }
    );
    const env = { GIT_INDEX_FILE: index };
    await runGit(exec, worktree, ["add", "-A"], { env });

    const patch = await runGit(exec, worktree, [...DIFF_FLAGS, "--binary", baseSha, "--"], {
      env
    });
    const names = await runGit(
      exec,
      worktree,
      [...DIFF_FLAGS, "--name-status", "-z", baseSha, "--"],
      { env }
    );
    // A cut-off patch would hash and apply wrongly. Fail instead.
    if (patch.truncated || names.truncated) {
      throw new GitError("The diff is larger than the capture limit", ["git", "diff"], null);
    }
    return {
      patch: patch.stdout,
      files: parseNameStatus(names.stdout),
      diffHash: createHash("sha256").update(patch.stdout).digest("hex")
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};
