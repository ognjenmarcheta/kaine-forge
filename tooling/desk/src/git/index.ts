export { isGitBranchName, isValidBranchName, type BranchName } from "./git.branch";
export {
  diffAgainstBase,
  DIFF_STATUSES,
  type DiffFile,
  type DiffResult,
  type DiffStatus
} from "./git.diff";
export {
  REF_VIOLATION_KINDS,
  type GitPort,
  type RefsSnapshot,
  type RefViolation,
  type RefViolationKind,
  type WorktreeAddRequest,
  type WorktreeEntry
} from "./git.port";
export { compareRefs, createGitPort, isOtherIssueRef } from "./git.real";
export { GitError, runGit, tryGit, type GitOutcome, type RunGitOptions } from "./git.run";
export {
  commitStaged,
  conflictedFiles,
  existsInHead,
  looksLikeGitError,
  looksRejected,
  pushBranch,
  readGitIdentity,
  rebaseAbort,
  rebaseOnto,
  revParse,
  stageFiles,
  stagedPaths,
  unstageAll,
  type GitIdentity
} from "./git.ship";
export { fileModeIgnored, indexExecBits, patchExecBits, setIndexExecBits } from "./git.modes";
