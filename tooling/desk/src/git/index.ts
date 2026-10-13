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
export { compareRefs, createGitPort, GitError, runGit, type RunGitOptions } from "./git.real";
