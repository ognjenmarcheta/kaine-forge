import type { CheckKind, CheckReport } from "../check";
import { stepRoleOf, type FlowSnapshot, type HistoryEvent } from "../contracts";
import { isValidBranchName } from "../git";
import type { RecheckResult } from "../github/github.authorization";
import type { ControllerIdentity } from "../github/github.identity";
import type { PullRequestView } from "../github/github.pull-request";
import { protectedPathReason } from "../policy";

/**
 * The ship gate as a pure function. Every fact is gathered by the caller and
 * passed in, so each rule is testable on its own. `evaluateShipGate` reports
 * every failed rule, not only the first, so the engineer sees all of them.
 * Whether the owner confirmed is not a gate rule: `shipAdmission` decides it before the
 * gate runs. ALL rules must hold:
 *
 * 1. the check report passed, is of an accepted kind, and was taken on the
 *    code that ships (`diffHash`);
 * 2. `gh` is signed in as the configured owner;
 * 3. the branch name is valid and is the branch of the issue;
 * 4. the authorization snapshot still holds (issue open, text unchanged);
 * 5. HEAD, the branch and the remotes are as the last agent stage left them;
 * 6. no protected path is in the diff, and the diff is not empty;
 * 7. the owner approved at a gate of the flow (`ownerApproved`), and the reviewer approved the
 *    code that ships;
 * 8. for an update of an open PR (a PR feedback round): a fresh read of the PR
 *    shows it open, on the issue branch, at a head the desk knows.
 */

export const SHIP_GATE_FAILURES = [
  "checks-missing",
  "checks-wrong-kind",
  "checks-failed",
  "checks-stale",
  "identity",
  "branch-invalid",
  "branch-mismatch",
  "authorization-missing",
  "authorization-unavailable",
  "authorization-changed",
  "refs-baseline-missing",
  "refs-changed",
  "protected-paths",
  "no-changes",
  "owner-not-approved",
  "review-missing",
  "review-not-approved",
  "review-stale",
  "pr-unavailable",
  "pr-not-open",
  "pr-head-moved",
  "pr-mismatch"
] as const;
export type ShipGateFailureKind = (typeof SHIP_GATE_FAILURES)[number];

export interface ShipGateFailure {
  readonly kind: ShipGateFailureKind;
  readonly message: string;
}

export type AuthorizationCheck =
  | RecheckResult
  /** The state holds no authorization snapshot. */
  | { readonly status: "missing" }
  /** The fresh issue read failed, so authorization cannot be proved. */
  | { readonly status: "unavailable"; readonly reason: string };

export interface ShipGateReview {
  readonly verdict: "approve" | "changes-requested";
  readonly blockingFindings: number;
  /** Hash of the diff the reviewer read. */
  readonly diffHash: string;
}

/** An update ship pushes to the PR the first ship opened. The gate reads it again first. */
export interface ShipGatePullRequest {
  readonly number: number;
  /** The branch the PR must have as its head. */
  readonly branch: string;
  /**
   * Heads the PR may have: the head the desk pushed or read last, and a commit this run
   * already pushed (a run that resumes after the push).
   */
  readonly allowedHeads: readonly string[];
  /** A fresh read of the PR, or why the read failed. */
  readonly view: PullRequestView | { readonly error: string };
}

export interface ShipGateInput {
  readonly checks: {
    readonly report: CheckReport | null;
    /** The kinds that count. Before the ship checks run, a passed `loop` report counts too. */
    readonly accept: readonly CheckKind[];
  };
  /** Hash of the code that ships. A report and a review must match it. */
  readonly diffHash: string;
  /** Every path the diff touches, including the old path of a rename. */
  readonly changedPaths: readonly string[];
  readonly identity: ControllerIdentity;
  readonly branch: { readonly actual: string | null; readonly expected: string | null };
  readonly authorization: AuthorizationCheck;
  /** Differences from the last agent stage's refs, or `null` when no baseline exists. */
  readonly refViolations: readonly string[] | null;
  /** The owner's approval the flow asks for before a ship: see `ownerApproved`. */
  readonly ownerApproved: boolean;
  readonly review: ShipGateReview | null;
  /** The diff hash the review must carry, or `null` to skip that comparison (after a rebase). */
  readonly expectedReviewDiffHash: string | null;
  /** The open PR an update ship pushes to. Absent or `null` for the first ship. */
  readonly pullRequest?: ShipGatePullRequest | null | undefined;
}

/** Rule 9 alone. The executor asks it again right before an update push. */
export const pullRequestFailures = (pr: ShipGatePullRequest): ShipGateFailure[] => {
  const { view } = pr;
  if ("error" in view) {
    return [
      { kind: "pr-unavailable", message: `PR #${pr.number} could not be read: ${view.error}` }
    ];
  }
  const failures: ShipGateFailure[] = [];
  if (view.number !== pr.number || view.headRefName !== pr.branch) {
    failures.push({
      kind: "pr-mismatch",
      message: `PR #${view.number} has the head '${view.headRefName}', but the issue records PR #${pr.number} on '${pr.branch}'.`
    });
  }
  if (view.state !== "OPEN") {
    failures.push({
      kind: "pr-not-open",
      message: `PR #${pr.number} is ${view.state.toLowerCase()}. Run refresh.`
    });
  }
  if (!pr.allowedHeads.includes(view.headRefOid)) {
    failures.push({
      kind: "pr-head-moved",
      message: `The head of PR #${pr.number} moved to ${short(view.headRefOid)}. Someone else pushed to the branch.`
    });
  }
  return failures;
};

/** History events that record the owner's approval at a gate. */
const APPROVAL_EVENTS: ReadonlySet<string> = new Set(["plan-approved", "gate-approved"]);

/**
 * The owner's approval a ship needs, from the issue's flow snapshot and history:
 *
 * - an automatic ship (`auto: true`) needs none: no human confirms it, every other rule applies;
 * - else an approval recorded at a gate of the flow other than the ship gate (in the default
 *   flow, `plan-approved` at `plan-gate`);
 * - a flow whose only gate is the ship gate has no other approval: the confirmation there is it.
 */
export const ownerApproved = (
  snapshot: FlowSnapshot,
  history: readonly Pick<HistoryEvent, "stage" | "event">[]
): boolean => {
  const { steps } = snapshot.flow;
  if (steps.some((step) => step.kind === "ship" && step.auto)) return true;
  const gates = new Set(
    steps
      .filter((step) => step.kind === "gate" && stepRoleOf(snapshot, step.id) !== "ship-gate")
      .map((step) => step.id)
  );
  if (gates.size === 0) return true;
  return history.some((entry) => APPROVAL_EVENTS.has(entry.event) && gates.has(entry.stage));
};

export interface ShipGateResult {
  readonly ok: boolean;
  readonly failures: readonly ShipGateFailure[];
}

const short = (hash: string): string => hash.slice(0, 12);

export const evaluateShipGate = (input: ShipGateInput): ShipGateResult => {
  const failures: ShipGateFailure[] = [];
  const fail = (kind: ShipGateFailureKind, message: string): void => {
    failures.push({ kind, message });
  };

  const { report, accept } = input.checks;
  if (report === null) {
    fail("checks-missing", "There is no check report. Run the checks first.");
  } else if (!accept.includes(report.kind)) {
    fail(
      "checks-wrong-kind",
      `The latest check report is of kind '${report.kind}'; ship needs ${accept.map((kind) => `'${kind}'`).join(" or ")}.`
    );
  } else if (!report.passed) {
    fail("checks-failed", "The latest check report did not pass.");
  } else if (report.diffHash !== input.diffHash) {
    fail(
      "checks-stale",
      `The code changed after the checks ran (checked ${short(report.diffHash)}, now ${short(input.diffHash)}). Run the checks again.`
    );
  }

  if (!input.identity.ok) fail("identity", input.identity.reason);

  const { actual, expected } = input.branch;
  if (actual === null) {
    fail("branch-invalid", "HEAD is detached, so there is no branch to ship.");
  } else if (!isValidBranchName(actual)) {
    fail(
      "branch-invalid",
      `'${actual}' is not a valid desk branch name (KAINE-<n>-<type>-<slug>).`
    );
  } else if (expected !== null && actual !== expected) {
    fail("branch-mismatch", `The worktree is on '${actual}', but the issue records '${expected}'.`);
  }

  switch (input.authorization.status) {
    case "unchanged":
      break;
    case "changed":
      fail("authorization-changed", input.authorization.reasons.join(" "));
      break;
    case "missing":
      fail("authorization-missing", "The issue holds no authorization snapshot.");
      break;
    case "unavailable":
      fail(
        "authorization-unavailable",
        `Authorization could not be checked: ${input.authorization.reason}`
      );
      break;
  }

  if (input.refViolations === null) {
    fail(
      "refs-baseline-missing",
      "No record of the refs after the last agent stage exists, so an unnoticed change cannot be ruled out."
    );
  } else if (input.refViolations.length > 0) {
    fail(
      "refs-changed",
      `A ref changed since the last agent stage: ${input.refViolations.join("; ")}.`
    );
  }

  const protectedReasons = input.changedPaths.flatMap((file) => {
    const reason = protectedPathReason(file);
    return reason === null ? [] : [reason];
  });
  if (protectedReasons.length > 0) fail("protected-paths", protectedReasons.join("; "));
  if (input.changedPaths.length === 0) fail("no-changes", "The worktree has no change to ship.");

  if (!input.ownerApproved) {
    fail("owner-not-approved", "No gate of the flow recorded the owner's approval.");
  }

  if (input.review === null) {
    fail("review-missing", "There is no review result.");
  } else {
    if (input.review.verdict !== "approve" || input.review.blockingFindings > 0) {
      fail("review-not-approved", "The reviewer did not approve, or blocking findings remain.");
    }
    if (
      input.expectedReviewDiffHash !== null &&
      input.review.diffHash !== input.expectedReviewDiffHash
    ) {
      fail(
        "review-stale",
        `The code changed after the review (reviewed ${short(input.review.diffHash)}, now ${short(input.expectedReviewDiffHash)}).`
      );
    }
  }

  if (input.pullRequest != null) failures.push(...pullRequestFailures(input.pullRequest));

  return { ok: failures.length === 0, failures };
};
