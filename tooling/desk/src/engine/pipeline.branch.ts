import type { IssueState, PlannerOutput } from "../contracts";
import type { GitPort } from "../git";
import { branchName } from "./worktree.bootstrap";

export type BranchRename =
  | { readonly status: "unchanged" }
  | { readonly status: "renamed"; readonly from: string; readonly to: string }
  /** The planner's name could not be used. The provisional branch stays. */
  | { readonly status: "skipped"; readonly reason: string };

/**
 * After plan approval the planner's `pr.type` and `pr.slug` fix the branch
 * name. Rename the provisional branch with `git branch -m` when the names
 * differ. It is safe only while nothing was pushed, so the rename is skipped if
 * a remote-tracking ref for the old name exists. A skipped rename is not an
 * error: the work goes on under the provisional name.
 */
export const renameBranchForPlan = async (
  git: GitPort,
  state: Pick<IssueState, "issueNumber" | "branch" | "worktreePath">,
  plan: Pick<PlannerOutput, "pr">
): Promise<BranchRename> => {
  const { branch, worktreePath } = state;
  if (branch === null || worktreePath === null) {
    return { status: "skipped", reason: "the issue has no branch or worktree yet" };
  }

  let target: string;
  try {
    target = branchName({ issue: state.issueNumber, type: plan.pr.type, slug: plan.pr.slug });
  } catch (error) {
    return { status: "skipped", reason: error instanceof Error ? error.message : "invalid branch" };
  }
  if (target === branch) return { status: "unchanged" };

  try {
    if (!(await git.checkRefFormat(worktreePath, target))) {
      return { status: "skipped", reason: `git rejects the branch name '${target}'` };
    }
    if (await git.branchExists(worktreePath, target)) {
      return { status: "skipped", reason: `the branch '${target}' already exists` };
    }
    const { refs } = await git.refsSnapshot(worktreePath);
    const pushed = Object.keys(refs).some(
      (ref) => ref.startsWith("refs/remotes/") && ref.endsWith(`/${branch}`)
    );
    if (pushed) {
      return { status: "skipped", reason: `'${branch}' exists on a remote, so it may be pushed` };
    }
    await git.branchRename(worktreePath, branch, target);
  } catch (error) {
    return { status: "skipped", reason: error instanceof Error ? error.message : "git failed" };
  }
  return { status: "renamed", from: branch, to: target };
};
