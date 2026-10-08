import { readFile } from "node:fs/promises";
import path from "node:path";

import { compareRefs, type GitPort, type RefsSnapshot, type RefViolation } from "../git";
import { REFS_BASELINE_FILE, refsBaselineSchema } from "./ship.contract";
import { writeJsonAtomic } from "../store/store.atomic";

/**
 * The refs baseline. The runner calls `recordRefsBaseline` after every agent
 * stage (once its own invariants held), and `ship` compares the worktree with
 * it. This catches a change made between the last agent stage and the ship
 * confirmation, such as a moved HEAD or a rewritten remote URL.
 */

export const writeRefsBaseline = (artifactsDir: string, snapshot: RefsSnapshot): Promise<void> =>
  writeJsonAtomic(path.join(artifactsDir, REFS_BASELINE_FILE), snapshot);

/** Snapshot the worktree and store it as the baseline. */
export const recordRefsBaseline = async (
  git: Pick<GitPort, "refsSnapshot">,
  worktree: string,
  artifactsDir: string
): Promise<RefsSnapshot> => {
  const snapshot = await git.refsSnapshot(worktree);
  await writeRefsBaseline(artifactsDir, snapshot);
  return snapshot;
};

/** The stored baseline, or `null` when it is missing or unreadable. */
export const readRefsBaseline = async (artifactsDir: string): Promise<RefsSnapshot | null> => {
  let text: string;
  try {
    text = await readFile(path.join(artifactsDir, REFS_BASELINE_FILE), "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = refsBaselineSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/**
 * The violations that matter for one issue. Git shares refs between all
 * worktrees of a repository, so the baseline and the worktree can differ in
 * ways that are not this issue's: another issue's branch, a fetch that moved
 * `refs/remotes/*`, a stash made elsewhere. Those are ignored. What stays:
 * HEAD, the current branch, this branch's own ref, tags, and remote config.
 */
export const shipRefViolations = (
  baseline: RefsSnapshot,
  current: RefsSnapshot,
  branch: string
): RefViolation[] => {
  const own = `refs/heads/${branch}`;
  return compareRefs(baseline, current).filter((violation) => {
    switch (violation.kind) {
      case "head-moved":
      case "branch-changed":
      case "remote-changed":
        return true;
      case "stash-changed":
        return false;
      case "ref-added":
      case "ref-moved":
      case "ref-deleted":
        return violation.subject === own || violation.subject.startsWith("refs/tags/");
    }
  });
};

/**
 * The baseline as it stands after this step made its own commit: HEAD and the
 * branch ref point at `commitSha`. Used when a run resumes after the commit.
 */
export const baselineAfterCommit = (
  baseline: RefsSnapshot,
  branch: string,
  commitSha: string
): RefsSnapshot => ({
  ...baseline,
  head: commitSha,
  refs: { ...baseline.refs, [`refs/heads/${branch}`]: commitSha }
});
