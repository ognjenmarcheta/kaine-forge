export { loadDeskConfig, type DeskConfigLoadResult } from "./config/config.load";
export {
  createPipelineRunner,
  type PipelineRunner,
  type RemoveOptions,
  type RemoveResult,
  type StartOptions
} from "./engine/pipeline.runner";
export { renameBranchForPlan, type BranchRename } from "./engine/pipeline.branch";
export { createScheduler, type Scheduler } from "./engine/pipeline.scheduler";
export {
  recoverInterrupted,
  recoverIssue,
  stopLeftoverProcess,
  type RecoveryAction,
  type RecoveryDeps,
  type RecoveryEntry
} from "./engine/pipeline.recovery";
export { locateFindings, type LocatedFindings } from "./engine/pipeline.review-locations";
export { needsYouReason } from "./engine/pipeline.state";
export {
  NOTIFY_KINDS,
  REFUSALS,
  type NotifyKind,
  type PipelineDeps,
  type PipelineEvent,
  type PipelineNotification,
  type PipelineResult,
  type Refusal,
  type ShipActionResult,
  type ShipDryRunResult,
  type ShipOptions,
  type StatusEntry,
  type StopKind
} from "./engine/pipeline.types";
export { BASE_BRANCH, parseDeskBranch, worktreeDirFor } from "./engine/pipeline.stage.setup";
export {
  SnapshotFileError,
  createSnapshotGitHubPort,
  issueSnapshotSchema,
  readSnapshotFile
} from "./github/github.snapshot-file";
export {
  transition,
  type MachineState,
  type NeedsYouReason,
  type TransitionGuard,
  type TransitionResult,
  type Trigger,
  type TriggerType
} from "./engine/pipeline.machine";
export { appendJsonl, writeJsonAtomic } from "./store/store.atomic";
export {
  createIssueStore,
  type IssueListEntry,
  type IssueReadResult,
  type IssueStore,
  type UnreadableReason
} from "./store/store.issue";
export {
  acquireLease,
  type Lease,
  type LeaseAcquireResult,
  type LeaseDeps,
  type LeaseRecord
} from "./store/store.lease";
export {
  runCli,
  createDefaultDeps,
  type CliDeps,
  type CliResult,
  type LiveOutput
} from "./cli/desk.cli";
export {
  formatDoctorReport,
  runDoctor,
  type CheckStatus,
  type DoctorCheck,
  type DoctorDeps,
  type DoctorReport
} from "./doctor/doctor.checks";
export {
  renderTicket,
  runIntake,
  type IntakeDeps,
  type IntakeOptions,
  type IntakeResult
} from "./engine/intake.run";
export {
  DESK_ROLES,
  OPTIONAL_ROLE_SKILLS,
  ROLE_SKILLS,
  bootstrapPlan,
  branchName,
  evaluateStep,
  isValidBranchName,
  skillsForRoles,
  slugify,
  type BootstrapInput,
  type BootstrapPlan,
  type BootstrapStep,
  type BranchName,
  type DeskRole,
  type StepExpectation,
  type StepVerdict
} from "./engine/worktree.bootstrap";
export {
  authorize,
  contentFingerprint,
  fenceUntrusted,
  recheckAuthorization,
  statusMarker,
  trustedComments,
  type AuthorizationResult,
  type RecheckResult
} from "./github/github.authorization";
export {
  CONTRACT_SECTIONS,
  formatContract,
  parseAcceptanceCriteria,
  parseContract,
  type ContractReport,
  type ContractSection
} from "./github/github.contract";
export { GhError, createGhClient, type GhClient } from "./github/github.gh";
export {
  checkControllerIdentity,
  evaluateControllerIdentity,
  type ControllerIdentity
} from "./github/github.identity";
export { fetchIssueSnapshot, READY_LABEL } from "./github/github.issue";
export {
  AGENT_LABELS,
  LABEL_DEFINITIONS,
  applyLabelChange,
  bestEffort,
  labelForState,
  labelSyncCommands,
  planLabelChange,
  type AgentLabel,
  type LabelChange,
  type LabelDefinition
} from "./github/github.labels";
export { createGitHubPort } from "./github/github.port";
export { renderStatusComment, upsertStatusComment } from "./github/github.status-comment";
export type {
  IssueComment,
  IssueLabelEvent,
  IssueSnapshot,
  RepositoryInfo,
  StatusCommentResult
} from "./github/github.types";
export {
  createExec,
  systemClock,
  type Clock,
  type Exec,
  type ExecRequest,
  type ExecResult,
  type GitHubPort
} from "./ports";
export { stopProcessGroup, stopProcessTree, type CleanupStatus } from "./process/process.tree";
export { configPath, resolveRepoLocation, type RepoLocation } from "./store/store.root";
export * from "./agents/index";
export * from "./agents/roles/index";
export * from "./check/index";
export * from "./git/index";
export * from "./policy/index";
export * from "./worktree/index";
export * from "./log/index";
export * from "./notify/index";
export * from "./ship/index";
export * from "./server/index";
