import { readFile } from "node:fs/promises";
import path from "node:path";

import { checkReportSchema, type CheckReport } from "../check/check.contract";
import {
  buildFlowModel,
  type CheckSummary,
  type ContractProgress,
  type IssueDetail,
  type IssueState,
  type IssueSummary,
  type ReviewSummary,
  type ShipReadiness
} from "../contracts";
import { indexArtifacts, readArtifact } from "./server.artifacts";
import { ISSUE_SUMMARY_FILE, issueSummarySchema } from "../engine/intake.run";
import { reviewArtifactSchema, type ReviewArtifact } from "../engine/pipeline.stage.review";
import { needsYouReason, stageEnteredAt } from "../engine/pipeline.state";
import type { Clock } from "../ports";
import type { IssueReadResult, IssueStore } from "../store/store.issue";

export interface DetailDeps {
  readonly store: IssueStore;
  readonly clock: Clock;
  /** Is an action of this issue running in this server? */
  readonly isBusy: (issueNumber: number) => boolean;
  /**
   * The hash of the worktree diff now. `null` when it cannot be computed.
   * Absent in tests and in setups without a git port.
   */
  readonly currentDiffHash?: ((state: IssueState) => Promise<string | null>) | undefined;
}

const parseJson = (bytes: Buffer): unknown => {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
};

/** Title, link and labels that intake wrote. A missing or malformed file gives `null`. */
const readIssueInfo = async (
  store: IssueStore,
  issueNumber: number
): Promise<{ title: string; url: string; labels: string[] } | null> => {
  const file = await readArtifactFile(store, issueNumber, ISSUE_SUMMARY_FILE);
  if (file === null) return null;
  const parsed = issueSummarySchema.safeParse(parseJson(file));
  return parsed.success
    ? { title: parsed.data.title, url: parsed.data.url, labels: parsed.data.labels }
    : null;
};

/** `issue.json` is not a client-visible artifact, so it is read here by a fixed name. */
const readArtifactFile = async (
  store: IssueStore,
  issueNumber: number,
  name: string
): Promise<Buffer | null> => {
  try {
    return await readFile(path.join(store.artifactsDir(issueNumber), name));
  } catch {
    return null;
  }
};

export const summarizeResult = async (
  deps: DetailDeps,
  issueNumber: number,
  result: IssueReadResult
): Promise<IssueSummary | null> => {
  const busy = deps.isBusy(issueNumber);
  if (result.status === "missing") return null;
  if (result.status === "unreadable") {
    return {
      readable: false,
      issueNumber,
      reason: result.reason,
      detail: result.detail,
      busy
    };
  }
  const { state } = result;
  const [info, ticket] = await Promise.all([
    readIssueInfo(deps.store, issueNumber),
    readArtifact(deps.store, issueNumber, "ticket")
  ]);
  const contract =
    ticket.status === "ok" ? parseContractProgress(ticket.bytes.toString("utf8")) : null;
  const flow = buildFlowModel(state, deps.clock.now().getTime());
  return {
    readable: true,
    issueNumber,
    title: info?.title ?? null,
    url: info?.url ?? null,
    labels: info?.labels ?? [],
    stage: state.stage,
    status: state.status,
    branch: state.branch,
    loops: state.loops,
    needsYouReason: needsYouReason(state),
    resumeStage: state.resumeStage,
    prUrl: state.prUrl ?? null,
    contract: contract === null ? null : { found: contract.found, total: contract.total },
    stageEnteredAt: stageEnteredAt(state),
    progress: flow.nodes.map((node) => node.status),
    currentNode: flow.current,
    busy,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt
  };
};

export const summarizeIssue = async (
  deps: DetailDeps,
  issueNumber: number
): Promise<IssueSummary | null> =>
  summarizeResult(deps, issueNumber, await deps.store.read(issueNumber));

// --- detail ---------------------------------------------------------------

const READINESS_LINE = /^Readiness: contract (\d+)\/(\d+)(?:, missing: (.*))?$/m;

/** "contract N/6" from the line intake writes into `ticket.md`. */
export const parseContractProgress = (ticket: string): ContractProgress | null => {
  const match = READINESS_LINE.exec(ticket);
  const found = match?.[1];
  const total = match?.[2];
  if (found === undefined || total === undefined) return null;
  return {
    found: Number(found),
    total: Number(total),
    missing: (match?.[3] ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== "")
  };
};

const toCheckSummary = (report: CheckReport): CheckSummary => ({
  passed: report.passed,
  kind: report.kind,
  steps: report.steps.map((step) => ({
    argv: [...step.argv],
    code: step.code,
    timedOut: step.timedOut,
    durationMs: step.durationMs
  })),
  fingerprint: report.fingerprint,
  diffHash: report.diffHash,
  generatedDrift: report.generatedDrift,
  startedAt: report.startedAt,
  finishedAt: report.finishedAt
});

const toReviewSummary = (artifact: ReviewArtifact): ReviewSummary => {
  const { review } = artifact;
  const bySeverity = { Critical: 0, Consider: 0, Nit: 0, FYI: 0 };
  for (const finding of review.findings) bySeverity[finding.severity] += 1;
  return {
    verdict: review.verdict,
    blocking: review.findings.filter((finding) => finding.blocking).length,
    bySeverity,
    findings: review.findings.map((finding) => ({
      severity: finding.severity,
      blocking: finding.blocking,
      file: finding.file,
      line: finding.line,
      section: finding.section,
      summary: finding.summary,
      fix: finding.fix
    })),
    rejected: artifact.rejected.length,
    diffHash: artifact.diffHash,
    plainLanguage: review.plainLanguage
  };
};

const readParsed = async <T>(
  deps: DetailDeps,
  issueNumber: number,
  id: "check-report" | "review",
  parse: (json: unknown) => T | null
): Promise<T | null> => {
  const read = await readArtifact(deps.store, issueNumber, id);
  return read.status === "ok" ? parse(parseJson(read.bytes)) : null;
};

const shipReadiness = async (
  deps: DetailDeps,
  state: IssueState,
  check: CheckSummary | null,
  review: ReviewSummary | null
): Promise<ShipReadiness> => {
  const atGate = state.stage === "pr-review";
  const checkPassed = check === null ? null : check.passed;
  const reviewApproved =
    review === null ? null : review.verdict === "approve" && review.blocking === 0;
  const reviewedDiffMatches =
    check === null || review === null ? null : check.diffHash === review.diffHash;
  let currentDiffMatches: boolean | null = null;
  if (atGate && check !== null && deps.currentDiffHash !== undefined) {
    try {
      const current = await deps.currentDiffHash(state);
      currentDiffMatches = current === null ? null : current === check.diffHash;
    } catch {
      currentDiffMatches = null;
    }
  }
  return {
    atGate,
    checkPassed,
    reviewApproved,
    reviewedDiffMatches,
    currentDiffMatches,
    ready:
      atGate &&
      checkPassed === true &&
      reviewApproved === true &&
      reviewedDiffMatches !== false &&
      currentDiffMatches !== false
  };
};

export type DetailResult =
  | { readonly status: "ok"; readonly detail: IssueDetail }
  | { readonly status: "missing" }
  | { readonly status: "unreadable"; readonly summary: IssueSummary };

/** Everything the issue page shows, from the state file and the artifacts. */
export const buildIssueDetail = async (
  deps: DetailDeps,
  issueNumber: number
): Promise<DetailResult> => {
  const result = await deps.store.read(issueNumber);
  const summary = await summarizeResult(deps, issueNumber, result);
  if (summary === null) return { status: "missing" };
  if (result.status !== "ok" || !summary.readable) return { status: "unreadable", summary };

  const { state } = result;
  const [artifacts, ticket, checkReport, reviewArtifact] = await Promise.all([
    indexArtifacts(deps.store, issueNumber),
    readArtifact(deps.store, issueNumber, "ticket"),
    readParsed(deps, issueNumber, "check-report", (json) => {
      const parsed = checkReportSchema.safeParse(json);
      return parsed.success ? parsed.data : null;
    }),
    readParsed(deps, issueNumber, "review", (json) => {
      const parsed = reviewArtifactSchema.safeParse(json);
      return parsed.success ? parsed.data : null;
    })
  ]);
  const check = checkReport === null ? null : toCheckSummary(checkReport);
  const review = reviewArtifact === null ? null : toReviewSummary(reviewArtifact);

  return {
    status: "ok",
    detail: {
      summary,
      state,
      flow: buildFlowModel(state, deps.clock.now().getTime()),
      artifacts,
      contract:
        ticket.status === "ok" ? parseContractProgress(ticket.bytes.toString("utf8")) : null,
      check,
      review,
      ship: await shipReadiness(deps, state, check, review)
    }
  };
};
