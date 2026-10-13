import type { CheckKind, CheckReport } from "../check";
import { isValidBranchName } from "../engine/worktree.bootstrap";
import type { RecheckResult } from "../github/github.authorization";
import type { ControllerIdentity } from "../github/github.identity";
import { protectedPathReason } from "../policy";

/**
 * The ship gate as a pure function. Every fact is gathered by the caller and
 * passed in, so each rule is testable on its own. `evaluateShipGate` reports
 * every failed rule, not only the first, so the engineer sees all of them.
 * ALL rules must hold:
 *
 * 1. the engineer confirmed;
 * 2. the check report passed, is of an accepted kind, and was taken on the
 *    code that ships (`diffHash`);
 * 3. `gh` is signed in as the configured owner;
 * 4. the branch name is valid and is the branch of the issue;
 * 5. the authorization snapshot still holds (issue open, text unchanged);
 * 6. HEAD, the branch and the remotes are as the last agent stage left them;
 * 7. no protected path is in the diff, and the diff is not empty;
 * 8. the engineer approved the plan, and the reviewer approved the code that ships.
 */

export const SHIP_GATE_FAILURES = [
  "not-confirmed",
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
  "plan-not-approved",
  "review-missing",
  "review-not-approved",
  "review-stale"
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

export interface ShipGateInput {
  /** The engineer's explicit confirmation. Only `true` passes. */
  readonly confirm: boolean;
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
  /** `plan-approved` is in the issue history. */
  readonly planApproved: boolean;
  readonly review: ShipGateReview | null;
  /** The diff hash the review must carry, or `null` to skip that comparison (after a rebase). */
  readonly expectedReviewDiffHash: string | null;
}

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

  if (input.confirm !== true) fail("not-confirmed", "Ship needs the explicit confirmation.");

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

  if (!input.planApproved) fail("plan-not-approved", "The plan was not approved at the plan gate.");

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

  return { ok: failures.length === 0, failures };
};
