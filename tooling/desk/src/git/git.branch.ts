import { CONVENTIONAL_TYPES } from "../contracts";

/**
 * The branch-name rule of the desk, in one place. Every name the desk gives git (a base branch,
 * an issue branch) passes `isGitBranchName`: it starts with a letter or a digit, so git never
 * reads it as an option, and it holds no `..`. An issue branch is also
 * `KAINE-<issue>-<type>-<slug>`, as AGENTS.md and CONTRIBUTING.md define it. Git's own
 * `check-ref-format` still has the last word for a new branch.
 */

export type BranchName = string;

const GIT_BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const DESK_BRANCH_PATTERN = new RegExp(
  `^KAINE-(\\d+-)?(${CONVENTIONAL_TYPES.join("|")})-[a-z0-9-]+$`
);

export const isGitBranchName = (name: string): boolean =>
  GIT_BRANCH_PATTERN.test(name) && !name.includes("..");

export const isValidBranchName = (name: string): name is BranchName =>
  DESK_BRANCH_PATTERN.test(name) && isGitBranchName(name);
