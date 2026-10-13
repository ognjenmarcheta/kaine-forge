import { z } from "zod";

import type { CheckReport } from "../check";
import type { AttributionViolation } from "./ship.attribution";
import type { ShipGateFailure } from "./ship.gate";

/**
 * Shapes the ship step writes to the artifacts directory and the types it
 * returns. Files are read back across runs (and by a UI later), so they carry
 * a schema. Results and failures are plain types: they never leave the process.
 */

export const SHIP_RECORD_FILE = "ship-record.json";
export const SHIP_PLAN_FILE = "ship-plan.json";
export const PR_BODY_FILE = "pr-body.md";
export const COMMIT_MESSAGE_FILE = "commit-message.txt";
export const REFS_BASELINE_FILE = "refs-baseline.json";
/** Subdirectory for the ship check report, so the loop report in the parent stays intact. */
export const SHIP_CHECK_DIR = "ship";

const sha = z.string().regex(/^[0-9a-f]{40}([0-9a-f]{24})?$/);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const timestamp = z.iso.datetime({ offset: true });

// --- refs baseline ----------------------------------------------------------

/** The refs right after the last agent stage. `ship` compares the worktree with them. */
export const refsBaselineSchema = z
  .object({
    head: sha.nullable(),
    branch: z.string().nullable(),
    refs: z.record(z.string(), z.string()),
    remotes: z.record(z.string(), z.string()),
    stash: z.array(z.string())
  })
  .strict();

// --- changeset outcome --------------------------------------------------------

export const changesetOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none"), reason: z.string() }).strict(),
  z
    .object({
      kind: z.literal("file"),
      reason: z.string(),
      /** Repo-relative path of the changeset file. */
      path: z.string().min(1),
      packages: z.array(z.string().min(1)).min(1),
      bump: z.enum(["patch", "minor", "major"])
    })
    .strict(),
  z
    .object({
      kind: z.literal("skip-label"),
      reason: z.string(),
      label: z.string().min(1)
    })
    .strict()
]);
export type ChangesetOutcome = z.infer<typeof changesetOutcomeSchema>;

// --- ship record --------------------------------------------------------------

/**
 * `ship-record.json`: what the ship step did so far, so a re-run after a
 * partial failure continues instead of repeating. Git itself is the source of
 * truth for "is there a commit": the record only says which commit is ours.
 */
export const shipRecordSchema = z
  .object({
    version: z.literal(1),
    branch: z.string().min(1),
    /** Commit the diff is taken against. It moves after a rebase. */
    baseSha: sha,
    changeset: changesetOutcomeSchema,
    /**
     * Intent log: the changeset file the step is about to write or has written
     * but not yet committed. A crash leaves it, and the next run removes the file.
     */
    pendingChangeset: z
      .object({ path: z.string().min(1), content: z.string() })
      .strict()
      .nullable(),
    /** Hash of the code the ship checks passed on. */
    checkedDiffHash: sha256.nullable(),
    /** Hash of the committed tree against `baseSha`. */
    committedDiffHash: sha256.nullable(),
    /** The commit this step made (or found). It moves after a rebase. */
    commitSha: sha.nullable(),
    rebased: z.boolean(),
    pullRequest: z
      .object({ number: z.number().int().positive(), url: z.string().min(1) })
      .strict()
      .nullable()
  })
  .strict();
export type ShipRecord = z.infer<typeof shipRecordSchema>;

// --- ship plan ----------------------------------------------------------------

/** `ship-plan.json`: what a ship run does (dry run) or did, for the engineer to read. */
export const shipPlanSchema = z
  .object({
    version: z.literal(1),
    issue: z.number().int().positive(),
    dryRun: z.boolean(),
    generatedAt: timestamp,
    branch: z.string().nullable(),
    baseSha: sha,
    gate: z
      .object({
        ok: z.boolean(),
        failures: z.array(z.object({ kind: z.string(), message: z.string() }).strict())
      })
      .strict(),
    changeset: z.union([
      changesetOutcomeSchema,
      z.object({ kind: z.literal("invalid"), reason: z.string() }).strict()
    ]),
    /** Text of the changeset file the run writes. `null` when it writes none. */
    changesetText: z.string().nullable(),
    commitHeader: z.string(),
    pullRequest: z
      .object({ base: z.literal("main"), draft: z.literal(true), title: z.string() })
      .strict(),
    /** Files the commit holds, exactly. */
    files: z.array(z.string()),
    bodyHeadings: z.array(z.string()),
    unfilledHeadings: z.array(z.string()),
    attribution: z.array(z.object({ source: z.string(), message: z.string() }).strict()),
    /** The result of `pnpm exec commitlint` on the commit message. */
    commitlint: z.object({ ok: z.boolean(), output: z.string() }).strict(),
    gitIdentityProblem: z.string().nullable(),
    pushes: z.string()
  })
  .strict();
export type ShipPlan = z.infer<typeof shipPlanSchema>;

// --- events -------------------------------------------------------------------

export const SHIP_STEPS = [
  "gate",
  "identity",
  "checks",
  "changeset",
  "message",
  "stage",
  "commit",
  "fetch",
  "rebase",
  "push",
  "pull-request",
  "label"
] as const;
export type ShipStep = (typeof SHIP_STEPS)[number];

/** Progress for a log, a CLI or a UI. `detail` is short text, never a secret. */
export type ShipEvent =
  | {
      readonly type: "step";
      readonly step: ShipStep;
      readonly status: "start" | "done" | "skipped" | "failed";
      readonly detail?: string;
    }
  | { readonly type: "log"; readonly message: string };

// --- results ------------------------------------------------------------------

/** Where the run stands, for the caller to persist when a later step fails. */
export interface ShipProgress {
  /** The base the diff is taken against now. It differs from the state's after a rebase. */
  readonly baseSha: string;
  /** The ship commit, or `null` when none exists yet. */
  readonly commitSha: string | null;
  readonly rebased: boolean;
}

export const SHIP_FAILURE_KINDS = [
  "state",
  "changeset-invalid",
  "git-identity",
  "checks-failed",
  "attribution",
  "commit-message-invalid",
  "stage-mismatch",
  "hook-failed",
  "commit-failed",
  "fetch-failed",
  "rebase-conflict",
  "push-rejected",
  "push-failed",
  "pull-request-failed",
  "error"
] as const;
export type ShipFailureKind = (typeof SHIP_FAILURE_KINDS)[number];

/** A step failed after the gate passed. Only `message` and `kind` are common to all. */
export type ShipFailure = {
  readonly message: string;
  readonly progress: ShipProgress | null;
} & (
  | { readonly kind: "state" | "changeset-invalid" | "git-identity" | "fetch-failed" | "error" }
  | { readonly kind: "pull-request-failed" }
  | { readonly kind: "checks-failed"; readonly report: CheckReport }
  | { readonly kind: "attribution"; readonly violations: readonly AttributionViolation[] }
  | { readonly kind: "commit-message-invalid"; readonly output: string }
  | {
      readonly kind: "stage-mismatch";
      readonly unexpected: readonly string[];
      readonly missing: readonly string[];
    }
  /** A commit-msg, pre-commit or pre-push hook refused. `log` is the output tail. */
  | { readonly kind: "hook-failed"; readonly hook: "commit" | "push"; readonly log: string }
  | { readonly kind: "commit-failed" | "push-failed"; readonly log: string }
  | { readonly kind: "rebase-conflict"; readonly files: readonly string[]; readonly log: string }
  | { readonly kind: "push-rejected"; readonly log: string }
);

export type ShipChangesetResult =
  | { readonly kind: "none"; readonly reason: string }
  | {
      readonly kind: "file";
      readonly reason: string;
      readonly path: string;
      readonly packages: readonly string[];
      readonly bump: "patch" | "minor" | "major";
    }
  | {
      readonly kind: "skip-label";
      readonly reason: string;
      readonly label: string;
      /** False when the label could not be added. `labelNote` says why. */
      readonly applied: boolean;
      readonly labelNote: string | null;
    };

export type ShipResult =
  | {
      readonly status: "shipped";
      readonly prUrl: string;
      readonly prNumber: number;
      /** True when a PR for the branch already existed. */
      readonly reusedPullRequest: boolean;
      readonly commitSha: string;
      readonly branch: string;
      readonly baseSha: string;
      readonly rebased: boolean;
      readonly changeset: ShipChangesetResult;
    }
  | {
      /** `confirm` false, or any other gate rule failed. Nothing was changed. */
      readonly status: "refused";
      readonly failures: readonly ShipGateFailure[];
    }
  | { readonly status: "failed"; readonly failure: ShipFailure }
  | {
      readonly status: "dry-run";
      readonly plan: ShipPlan;
      /** Absolute paths of the files the dry run wrote. */
      readonly files: {
        readonly plan: string;
        readonly prBody: string;
        readonly commitMessage: string;
      };
    };
