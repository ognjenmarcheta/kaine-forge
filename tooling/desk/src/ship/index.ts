export {
  ATTRIBUTION_SOURCES,
  findAiCoauthorViolation,
  findAttributionViolations,
  isAiIdentity,
  type AttributionSource,
  type AttributionViolation
} from "./ship.attribution";
export {
  BUMPS,
  CHANGESET_DIR,
  SKIP_CHANGESET_LABEL,
  changedWorkspaces,
  changesetDecision,
  changesetFileName,
  changesetRelativePath,
  discoverWorkspaces,
  renderChangeset,
  summarizeForChangeset,
  type Bump,
  type ChangesetDecision,
  type RenderChangesetInput,
  type WorkspacePackage
} from "./ship.changeset";
export {
  COMMIT_MESSAGE_FILE,
  PR_BODY_FILE,
  REFS_BASELINE_FILE,
  SHIP_CHECK_DIR,
  SHIP_FAILURE_KINDS,
  SHIP_PLAN_FILE,
  SHIP_RECORD_FILE,
  SHIP_STEPS,
  changesetOutcomeSchema,
  refsBaselineSchema,
  shipPlanSchema,
  shipRecordSchema,
  type ChangesetOutcome,
  type ShipChangesetResult,
  type ShipEvent,
  type ShipFailure,
  type ShipFailureKind,
  type ShipPlan,
  type ShipProgress,
  type ShipRecord,
  type ShipResult,
  type ShipStep
} from "./ship.contract";
export { describeGateFailures, describeShipEvent, describeShipFailure } from "./ship.describe";
export {
  SHIP_GATE_FAILURES,
  evaluateShipGate,
  type AuthorizationCheck,
  type ShipGateFailure,
  type ShipGateFailureKind,
  type ShipGateInput,
  type ShipGateResult,
  type ShipGateReview
} from "./ship.gate";
export {
  COMMIT_HEADER_MAX,
  buildCommitMessage,
  commitInputFor,
  parseConventionalHeader,
  type CommitMessage,
  type CommitMessageInput,
  type CommitSource
} from "./ship.message";
export {
  buildPrBody,
  parseTemplate,
  type ParsedTemplate,
  type PrBody,
  type PrBodyInput,
  type TemplateSection
} from "./ship.pr-body";
export {
  baselineAfterCommit,
  readRefsBaseline,
  recordRefsBaseline,
  shipRefViolations,
  writeRefsBaseline
} from "./ship.refs";
export { shipIssue, type ShipDeps, type ShipRequest, type ShipTimeouts } from "./ship.run";
