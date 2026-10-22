import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { resumeLine } from "../agents/agent.resume";
import { checkReportSchema, type CheckReport } from "../check/check.contract";
import {
  DEFAULT_LOOP_LIMITS,
  agentOf,
  buildFlowModel,
  isShipGate,
  builderOutputSchema,
  providerSchema,
  type AgentSession,
  type FlowDefinitionView,
  type CheckSummary,
  type ContractProgress,
  type IssueDetail,
  type IssueState,
  type IssueSummary,
  type PlannerOutput,
  type Provider,
  type ReviewSummary,
  type SessionResume,
  type ShipReadiness
} from "../contracts";
import { indexArtifacts, readArtifact } from "./server.artifacts";
import { ISSUE_SUMMARY_FILE, issueSummarySchema } from "../engine/intake.run";
import { ARTIFACTS, readArtifactJson, readPlan } from "../engine/pipeline.artifacts";
import { reviewArtifactSchema, type ReviewArtifact } from "../engine/pipeline.stage.review";
import { needsYouReason, stageEnteredAt } from "../engine/pipeline.state";
import type { Clock } from "../ports";
import type { RunRecords } from "../stats/stats.runs";
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
  /** `runs.jsonl`. Absent: the detail shows no runs. */
  readonly readRuns?: (() => Promise<RunRecords>) | undefined;
  /** `maxPrRounds` of the config, for an issue whose flow has no pr-wait step. Absent: the default. */
  readonly prRoundLimit?: number | undefined;
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

/** `plan.json`, or `null` when it is missing, malformed, or cannot be read. */
const readPlanQuietly = async (
  store: IssueStore,
  issueNumber: number
): Promise<PlannerOutput | null> => {
  const plan = await readPlan(store.artifactsDir(issueNumber)).catch(() => null);
  return plan?.status === "ok" ? plan.value : null;
};

/** The run summary the engine writes for each agent run. Only the provider is read. */
const runProviderSchema = z.object({ provider: providerSchema });

const sessionProvider = async (
  store: IssueStore,
  issueNumber: number,
  role: AgentSession["role"]
): Promise<Provider | null> => {
  const file = await readArtifactFile(store, issueNumber, `agent-${role}.json`);
  return file === null
    ? null
    : (runProviderSchema.safeParse(parseJson(file)).data?.provider ?? null);
};

/** The worktree and the agent sessions the owner can resume by hand, as `desk resume` lists them. */
const sessionResume = async (store: IssueStore, state: IssueState): Promise<SessionResume> => {
  const worktree = state.worktreePath;
  const roles = ["builder", "planner"] as const;
  const sessions = await Promise.all(
    roles.map(async (role): Promise<AgentSession | null> => {
      const sessionId = state.sessions[role];
      if (sessionId === undefined) return null;
      const provider = await sessionProvider(store, state.issueNumber, role);
      return {
        role,
        sessionId,
        provider,
        command:
          provider === null || worktree === null ? null : resumeLine(provider, worktree, sessionId)
      };
    })
  );
  return {
    worktreePath: worktree,
    sessions: sessions.filter((session): session is AgentSession => session !== null)
  };
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
  const [info, ticket, plan] = await Promise.all([
    readIssueInfo(deps.store, issueNumber),
    readArtifact(deps.store, issueNumber, "ticket"),
    readPlanQuietly(deps.store, issueNumber)
  ]);
  const contract =
    ticket.status === "ok" ? parseContractProgress(ticket.bytes.toString("utf8")) : null;
  const flow = buildFlowModel(state, deps.clock.now().getTime());
  const snapshot = state.flowSnapshot;
  const prWait = snapshot.flow.steps.find((step) => step.kind === "pr-wait");
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
    prRound: state.prRounds ?? 0,
    prRoundLimit:
      prWait?.kind === "pr-wait"
        ? prWait.maxRounds
        : (deps.prRoundLimit ?? DEFAULT_LOOP_LIMITS.prRounds),
    needsYouReason: needsYouReason(state),
    resumeStage: state.resumeStage,
    prUrl: state.prUrl ?? null,
    contract: contract === null ? null : { found: contract.found, total: contract.total },
    stageEnteredAt: stageEnteredAt(state),
    progress: flow.nodes.map((node) => node.status),
    currentNode: flow.current,
    busy,
    paused: state.pauseRequested === true,
    pausedAt: state.pausedAt ?? null,
    planRisk: plan?.risk ?? null,
    flowId: snapshot.flow.id,
    flowName: snapshot.flow.name,
    flowHash: snapshot.hash,
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
  const atGate = isShipGate(state.flowSnapshot, state.stage);
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

/** The steps of the issue's flow snapshot, with their labels and agents. */
const flowDefinitionOf = (state: IssueState): FlowDefinitionView => {
  const snapshot = state.flowSnapshot;
  return {
    id: snapshot.flow.id,
    name: snapshot.flow.name,
    hash: snapshot.hash,
    source: snapshot.flowSource,
    steps: snapshot.flow.steps.map((step) => {
      const agent = step.kind === "agent" ? agentOf(snapshot, step.agent) : undefined;
      return {
        id: step.id,
        label: step.label,
        kind: step.kind,
        agent: agent === undefined ? null : { id: agent.id, name: agent.name, output: agent.output }
      };
    })
  };
};

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
  const dir = deps.store.artifactsDir(issueNumber);
  const [artifacts, ticket, checkReport, reviewArtifact, runs, plan, build, resume] =
    await Promise.all([
      indexArtifacts(deps.store, issueNumber),
      readArtifact(deps.store, issueNumber, "ticket"),
      readParsed(deps, issueNumber, "check-report", (json) => {
        const parsed = checkReportSchema.safeParse(json);
        return parsed.success ? parsed.data : null;
      }),
      readParsed(deps, issueNumber, "review", (json) => {
        const parsed = reviewArtifactSchema.safeParse(json);
        return parsed.success ? parsed.data : null;
      }),
      deps.readRuns?.() ?? Promise.resolve({ records: [], invalidLines: 0 }),
      readPlanQuietly(deps.store, issueNumber),
      readArtifactJson(dir, ARTIFACTS.build, builderOutputSchema).catch(() => null),
      sessionResume(deps.store, state)
    ]);
  const check = checkReport === null ? null : toCheckSummary(checkReport);
  const review = reviewArtifact === null ? null : toReviewSummary(reviewArtifact);

  return {
    status: "ok",
    detail: {
      summary,
      state,
      flow: buildFlowModel(state, deps.clock.now().getTime()),
      flowDefinition: flowDefinitionOf(state),
      artifacts,
      contract:
        ticket.status === "ok" ? parseContractProgress(ticket.bytes.toString("utf8")) : null,
      check,
      review,
      ship: await shipReadiness(deps, state, check, review),
      plan:
        plan === null
          ? null
          : { risk: plan.risk, riskReasons: plan.riskReasons, revision: plan.revision },
      buildRevision: build?.status === "ok" ? build.value.revision : null,
      approveNote: state.approveNote ?? null,
      resume,
      runs: runs.records.filter((record) => record.issue === issueNumber)
    }
  };
};
