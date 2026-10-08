import path from "node:path";

import type { Exec } from "../ports";

export const STATE_DIR_NAME = "kaine-desk";

export interface RepoLocation {
  /** Top level of the checkout the command runs in. */
  readonly repoRoot: string;
  /** Shared by every worktree of the repository and kept when a worktree is removed. */
  readonly gitCommonDir: string;
  /** `<git-common-dir>/kaine-desk`. Never committed. */
  readonly stateRoot: string;
}

const git = async (exec: Exec, cwd: string, args: readonly string[]): Promise<string> => {
  const result = await exec({ argv: ["git", ...args], cwd, timeoutMs: 15_000 });
  if (result.code !== 0) {
    throw new Error(
      `git ${args[0] ?? ""} failed in ${cwd}: ${result.stderr.trim() || "not a git repository"}`
    );
  }
  return result.stdout.trim();
};

/** Locate the checkout and the desk state directory. `git` may print the common dir relative to `cwd`. */
export const resolveRepoLocation = async (exec: Exec, cwd: string): Promise<RepoLocation> => {
  const repoRoot = path.resolve(cwd, await git(exec, cwd, ["rev-parse", "--show-toplevel"]));
  const gitCommonDir = path.resolve(cwd, await git(exec, cwd, ["rev-parse", "--git-common-dir"]));
  return { repoRoot, gitCommonDir, stateRoot: path.join(gitCommonDir, STATE_DIR_NAME) };
};

/** Optional per-developer override. Gitignored with the rest of `.ai.local/`. */
export const configPath = (repoRoot: string): string =>
  path.join(repoRoot, ".ai.local", "desk", "config.json");
