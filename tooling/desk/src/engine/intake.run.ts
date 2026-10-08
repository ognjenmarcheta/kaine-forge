import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import {
  DEFAULT_LOOP_LIMITS,
  type DeskConfig,
  type IssueState,
  type LoopLimits,
  type Stage
} from "../contracts";
import { transition, type MachineState, type Trigger } from "./pipeline.machine";
import { authorize, fenceUntrusted, trustedComments } from "../github/github.authorization";
import { formatContract, parseContract, type ContractReport } from "../github/github.contract";
import { checkControllerIdentity } from "../github/github.identity";
import {
  applyLabelChange,
  bestEffort,
  labelForState,
  planLabelChange
} from "../github/github.labels";
import { renderStatusComment } from "../github/github.status-comment";
import type { IssueSnapshot } from "../github/github.types";
import type { Clock, GitHubPort } from "../ports";
import type { IssueStore } from "../store/store.issue";

export interface IntakeDeps {
  readonly github: GitHubPort;
  readonly store: IssueStore;
  readonly clock: Clock;
  readonly config: DeskConfig;
  readonly log: (message: string) => void;
}

export interface IntakeOptions {
  readonly issueNumber: number;
  /** Skip the `ready-for-agent` label-actor check. Allowed for the owner's own run. */
  readonly override: boolean;
  /** Edit labels and the status comment on GitHub. Failures never fail the run. */
  readonly writeBack: boolean;
}

export type IntakeResult =
  /** Authorized, contract read, ticket written. The issue waits at `setup`. */
  | { readonly outcome: "ready"; readonly state: IssueState; readonly contract: ContractReport }
  /** The issue needs the owner before it can go on. */
  | { readonly outcome: "needs-you"; readonly state: IssueState; readonly reason: string }
  /** Intake already ran. Nothing changed. */
  | { readonly outcome: "skipped"; readonly state: IssueState; readonly reason: string }
  /** Intake could not run (identity, GitHub, or unreadable state). Nothing changed. */
  | { readonly outcome: "refused"; readonly reason: string };

/** What setup needs from the issue besides `ticket.md`: the title and labels. */
export const ISSUE_SUMMARY_FILE = "issue.json";
export const issueSummarySchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string(),
    url: z.string(),
    labels: z.array(z.string())
  })
  .strict();
export type IssueSummary = z.infer<typeof issueSummarySchema>;

const NOTE_READY_FOR_SETUP = "ready for setup";

const machineOf = (state: IssueState): MachineState => ({
  stage: state.stage,
  resumeStage: state.resumeStage,
  loops: state.loops,
  lastCheckFingerprint: state.lastCheckFingerprint
});

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown error";

const fresh = (issueNumber: number, at: string): IssueState => ({
  schemaVersion: 1,
  issueNumber,
  stage: "intake",
  status: "idle",
  resumeStage: null,
  branch: null,
  worktreePath: null,
  sessions: {},
  loops: { check: 0, review: 0 },
  lastCheckFingerprint: null,
  history: [],
  authorization: null,
  createdAt: at,
  updatedAt: at
});

/** The text an agent may read: title, body and trusted comments, fenced as data. */
export const renderTicket = (
  snapshot: IssueSnapshot,
  owner: string,
  contract: ContractReport
): string => {
  const content = [
    `Title: ${snapshot.title}`,
    "",
    "Body:",
    snapshot.body.trim() === "" ? "(empty)" : snapshot.body,
    ...trustedComments(snapshot, owner).flatMap((comment) => [
      "",
      `Comment by ${comment.author ?? "unknown"} (${comment.authorAssociation}):`,
      comment.body
    ])
  ].join("\n");
  return [
    `# Ticket #${snapshot.number}`,
    "",
    `Source: ${snapshot.url}`,
    `Labels: ${snapshot.labels.join(", ") || "none"}`,
    `Readiness: ${formatContract(contract)}`,
    "",
    fenceUntrusted(content),
    ""
  ].join("\n");
};

/**
 * Intake end to end against the ports: read the issue, prove who authorized
 * it, read the contract, record state and the ticket, then park at `setup`.
 * Authorization or contract failures move the issue to `needs-you`. Write-back
 * to GitHub runs last and never changes the result.
 */
export const runIntake = async (
  deps: IntakeDeps,
  options: IntakeOptions,
  limits: LoopLimits = DEFAULT_LOOP_LIMITS
): Promise<IntakeResult> => {
  const { github, store, clock, config, log } = deps;
  const { issueNumber } = options;

  const existing = await store.read(issueNumber);
  if (existing.status === "unreadable") {
    return {
      outcome: "refused",
      reason: `State for #${issueNumber} is unreadable (${existing.reason}): ${existing.detail}`
    };
  }
  const previous = existing.status === "ok" ? existing.state : null;
  const rerun = previous?.stage === "needs-you" && previous.resumeStage === "intake";
  if (previous !== null && previous.stage !== "intake" && !rerun) {
    return {
      outcome: "skipped",
      state: previous,
      reason: `#${issueNumber} is already at '${previous.stage}'. Intake runs once.`
    };
  }

  let identity;
  let snapshot: IssueSnapshot;
  try {
    identity = await checkControllerIdentity(github, config.owner);
    if (!identity.ok) return { outcome: "refused", reason: identity.reason };
    snapshot = await github.fetchIssue(issueNumber);
  } catch (error) {
    return { outcome: "refused", reason: `GitHub read failed: ${describe(error)}` };
  }
  const { owner } = identity;
  const stamp = (): string => clock.now().toISOString();

  let state = previous ?? fresh(issueNumber, stamp());
  const record = async (stage: Stage, event: string, note?: string): Promise<void> => {
    const entry = { at: stamp(), stage, event, ...(note === undefined ? {} : { note }) };
    state = { ...state, history: [...state.history, entry], updatedAt: entry.at };
    await store.appendEvent(issueNumber, entry);
  };
  const apply = (trigger: Trigger): MachineState => {
    const result = transition(machineOf(state), trigger, limits);
    if (!result.ok) throw new Error(`Intake transition rejected: ${result.reason}`);
    return result.state;
  };
  const move = (next: MachineState, status: IssueState["status"]): void => {
    state = { ...state, ...next, status, updatedAt: stamp() };
  };

  const finish = async (result: IntakeResult, needsYouReason: string | null) => {
    await store.write(state);
    if (options.writeBack) await writeBack(deps, state, snapshot.labels, needsYouReason);
    return result;
  };
  const park = async (reason: string): Promise<IntakeResult> => {
    move(apply({ type: "stage-complete", stage: "intake", outcome: "blocked" }), "waiting");
    await record("needs-you", "needs-you", reason);
    return finish({ outcome: "needs-you", state, reason }, reason);
  };

  if (rerun) move(apply({ type: "continue" }), "running");
  else if (previous === null) move(apply({ type: "start" }), "running");
  await record("intake", rerun ? "intake-restarted" : "intake-started");

  if (!snapshot.open) return park(`Issue #${issueNumber} is closed.`);

  const authorization = authorize(snapshot, {
    owner,
    override: options.override,
    now: clock.now()
  });
  if (!authorization.ok) return park(authorization.reason);
  if (authorization.snapshot.override) {
    log(`override: ${owner} started #${issueNumber} without a ready-for-agent label event`);
    await record("intake", "authorization-override", `run started by ${owner} with --override`);
  }

  const contract = parseContract(snapshot.body);
  if (contract.acceptanceCriteria.length === 0) {
    return park(
      `No acceptance criteria found (${formatContract(contract)}). Add an "Acceptance criteria" section with one checkable item per line.`
    );
  }

  const artifacts = store.artifactsDir(issueNumber);
  await mkdir(artifacts, { recursive: true });
  await writeFile(
    path.join(artifacts, "ticket.md"),
    renderTicket(snapshot, owner, contract),
    "utf8"
  );
  const summary: IssueSummary = {
    number: snapshot.number,
    title: snapshot.title,
    url: snapshot.url,
    labels: [...snapshot.labels]
  };
  await writeFile(
    path.join(artifacts, ISSUE_SUMMARY_FILE),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );

  state = { ...state, authorization: authorization.snapshot };
  move(apply({ type: "stage-complete", stage: "intake", outcome: "ok" }), "waiting");
  await record("setup", "intake-complete", `${formatContract(contract)}; ${NOTE_READY_FOR_SETUP}`);
  return finish({ outcome: "ready", state, contract }, null);
};

/** Labels and the status comment. Each write is best effort and logged on failure. */
const writeBack = async (
  deps: IntakeDeps,
  state: IssueState,
  currentLabels: readonly string[],
  needsYouReason: string | null
): Promise<void> => {
  const { github, log } = deps;
  const issue = state.issueNumber;
  await applyLabelChange(github, issue, planLabelChange(currentLabels, labelForState(state)), log);
  await bestEffort(
    "status comment",
    () => github.upsertStatusComment(issue, renderStatusComment({ state, needsYouReason })),
    log
  );
};
