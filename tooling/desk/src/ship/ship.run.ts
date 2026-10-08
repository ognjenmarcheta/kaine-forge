import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { checkReportSchema, runChecks, CHECK_REPORT_FILE, type CheckReport } from "../check";
import type { DeskConfig, IssueState, PlannerOutput } from "../contracts";
import { findAttributionViolations, isAiIdentity } from "./ship.attribution";
import {
  changesetDecision,
  changesetFileName,
  discoverWorkspaces,
  renderChangeset,
  CHANGESET_DIR,
  type ChangesetDecision
} from "./ship.changeset";
import {
  COMMIT_MESSAGE_FILE,
  PR_BODY_FILE,
  SHIP_CHECK_DIR,
  SHIP_PLAN_FILE,
  SHIP_RECORD_FILE,
  shipPlanSchema,
  shipRecordSchema,
  type ChangesetOutcome,
  type ShipChangesetResult,
  type ShipEvent,
  type ShipFailure,
  type ShipPlan,
  type ShipProgress,
  type ShipRecord,
  type ShipResult,
  type ShipStep
} from "./ship.contract";
import { evaluateShipGate, type AuthorizationCheck, type ShipGateInput } from "./ship.gate";
import {
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
  unstageAll
} from "./ship.git";
import { buildCommitMessage, commitInputFor } from "./ship.message";
import { buildPrBody } from "./ship.pr-body";
import { baselineAfterCommit, readRefsBaseline, shipRefViolations } from "./ship.refs";
import {
  ARTIFACTS,
  readArtifactJson,
  readPlan,
  writeArtifactText
} from "../engine/pipeline.artifacts";
import { reviewArtifactSchema, type ReviewArtifact } from "../engine/pipeline.stage.review";
import { diffAgainstBase, type DiffResult, type GitPort } from "../git";
import { recheckAuthorization } from "../github/github.authorization";
import { checkControllerIdentity, type ControllerIdentity } from "../github/github.identity";
import { isProtectedPath } from "../policy";
import type { Clock, Exec, GitHubPort } from "../ports";
import { writeJsonAtomic } from "../store/store.atomic";
import type { IssueStore } from "../store/store.issue";

/**
 * The ship executor: gate, ship checks, changeset, commit, rebase, push, draft
 * PR. It runs only after an explicit confirmation and it never merges,
 * approves, forces a push, skips a hook or marks a PR ready for review.
 *
 * Every step can fail, and a re-run after a failure continues without
 * repeating finished work:
 *
 * - the commit is found by `HEAD == record.commitSha` on a clean tree, so it
 *   is never made twice;
 * - a failed step before the commit rolls the worktree back (index reset, the
 *   changeset file removed), so the next run starts from the pristine tree;
 * - `git push -u` and an existing PR for the branch are both safe to repeat.
 *
 * Order: gate, ship checks, changeset file, commit, fetch and rebase, push,
 * draft PR. The ship checks run on the code before the changeset file is
 * added. The file is generated Markdown with a fixed shape, so the checked
 * hash is the hash of the code the reviewer saw. The record keeps both the
 * checked hash and the committed hash, so the gate stays exact after the
 * commit. `git add -A` appears only inside `diffAgainstBase`, on a temporary
 * index; the real index only ever receives an explicit file list.
 */

const BASE_BRANCH = "main";
const TEMPLATE_PATH = ".github/pull_request_template.md";

export interface ShipTimeouts {
  readonly commitMs: number;
  readonly pushMs: number;
  readonly rebaseMs: number;
  readonly commitlintMs: number;
}

const DEFAULT_TIMEOUTS: ShipTimeouts = {
  // The hooks run here: lint-staged on commit, ai:doctor and a typecheck on push.
  commitMs: 15 * 60_000,
  pushMs: 20 * 60_000,
  rebaseMs: 5 * 60_000,
  commitlintMs: 2 * 60_000
};

export interface ShipDeps {
  readonly exec: Exec;
  readonly git: GitPort;
  readonly github: GitHubPort;
  readonly clock: Clock;
  readonly config: DeskConfig;
  /** Only `read` and `artifactsDir` are used. */
  readonly store: Pick<IssueStore, "read" | "artifactsDir">;
  readonly onEvent?: ((event: ShipEvent) => void) | undefined;
  /** Runs a check inside the scheduler's one check slot. Default: run it at once. */
  readonly checkSlot?: (<T>(task: () => Promise<T>) => Promise<T>) | undefined;
  readonly timeouts?: Partial<ShipTimeouts> | undefined;
  /**
   * Awaited once, after the gate passed and before the first change (not in a
   * dry run). The pipeline uses it to enter the `ship` stage only for a run
   * that is allowed to change things, so a refusal leaves the state as it was.
   */
  readonly beforeChange?: (() => Promise<void>) | undefined;
}

export interface ShipRequest {
  readonly issue: number;
  /** The engineer's explicit confirmation. Without `true` the gate refuses. */
  readonly confirm: boolean;
  /**
   * Evaluate the gate and write `ship-plan.json`, `pr-body.md` and
   * `commit-message.txt` to the artifacts directory. Nothing is written to the
   * worktree, committed, pushed or sent to GitHub (reads only).
   */
  readonly dryRun?: boolean | undefined;
}

/** A step that ends the run. Thrown inside `runShip`, turned into a result by `shipIssue`. */
class ShipStop extends Error {
  constructor(readonly result: ShipResult) {
    super("ship stopped");
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown error";

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].sort();

const filesOf = (diff: DiffResult): string[] =>
  uniqueSorted(
    diff.files.flatMap((file) =>
      file.oldPath === undefined ? [file.path] : [file.path, file.oldPath]
    )
  );

const exists = async (file: string): Promise<boolean> => {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
};

/** Run the ship step. It never throws: every outcome is a `ShipResult`. */
export const shipIssue = async (deps: ShipDeps, request: ShipRequest): Promise<ShipResult> => {
  const holder: { progress: ShipProgress | null } = { progress: null };
  try {
    return await runShip(deps, request, holder);
  } catch (error) {
    if (error instanceof ShipStop) return error.result;
    return failed({ kind: "error", message: errorMessage(error), progress: holder.progress });
  }
};

const failed = (failure: ShipFailure): ShipResult => ({ status: "failed", failure });

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type FailureInput = DistributiveOmit<ShipFailure, "progress"> & {
  readonly progress?: ShipProgress | null;
};

/** The step a failure belongs to, for the event stream. */
const stepOf = (failure: ShipFailure): ShipStep => {
  switch (failure.kind) {
    case "checks-failed":
      return "checks";
    case "git-identity":
      return "identity";
    case "changeset-invalid":
      return "changeset";
    case "attribution":
    case "commit-message-invalid":
      return "message";
    case "stage-mismatch":
      return "stage";
    case "hook-failed":
      return failure.hook === "push" ? "push" : "commit";
    case "commit-failed":
      return "commit";
    case "fetch-failed":
      return "fetch";
    case "rebase-conflict":
      return "rebase";
    case "push-rejected":
    case "push-failed":
      return "push";
    case "pull-request-failed":
      return "pull-request";
    case "state":
    case "error":
      return "gate";
  }
};

const runShip = async (
  deps: ShipDeps,
  request: ShipRequest,
  holder: { progress: ShipProgress | null }
): Promise<ShipResult> => {
  const { exec, git, github, config, clock } = deps;
  const dryRun = request.dryRun === true;
  const timeouts: ShipTimeouts = { ...DEFAULT_TIMEOUTS, ...deps.timeouts };
  const emit = (event: ShipEvent): void => deps.onEvent?.(event);
  const log = (message: string): void => emit({ type: "log", message });
  const step = (name: ShipStep, status: "start" | "done" | "skipped" | "failed", detail?: string) =>
    emit({ type: "step", step: name, status, ...(detail === undefined ? {} : { detail }) });
  const stop = (failure: FailureInput): never => {
    const full: ShipFailure = { ...failure, progress: failure.progress ?? holder.progress };
    step(stepOf(full), "failed", full.message);
    throw new ShipStop(failed(full));
  };

  // --- state ---------------------------------------------------------------
  const loaded = await deps.store.read(request.issue);
  if (loaded.status !== "ok") {
    return stop({
      kind: "state",
      message:
        loaded.status === "missing"
          ? `Issue #${request.issue} has no state. Start it first.`
          : `The state of issue #${request.issue} is unreadable: ${loaded.detail}`
    });
  }
  const state: IssueState = loaded.state;
  if (state.stage === "shipped" || state.stage === "cancelled") {
    return stop({ kind: "state", message: `Issue #${request.issue} is '${state.stage}'.` });
  }
  const { worktreePath: worktree, baseSha: stateBase } = state;
  if (worktree === null || stateBase === null || stateBase === undefined) {
    return stop({ kind: "state", message: "There is no worktree or base commit to ship from." });
  }
  const artifactsDir = deps.store.artifactsDir(request.issue);
  const shipDir = path.join(artifactsDir, SHIP_CHECK_DIR);
  const recordFile = path.join(artifactsDir, SHIP_RECORD_FILE);

  const plan = await readPlan(artifactsDir);
  if (plan.status !== "ok") {
    return stop({
      kind: "state",
      message: plan.status === "missing" ? "plan.json is missing." : plan.detail
    });
  }
  const planned: PlannerOutput = plan.value;

  // --- record and orphan clean-up -------------------------------------------
  const savedRecord = await readArtifactJson(artifactsDir, SHIP_RECORD_FILE, shipRecordSchema);
  if (savedRecord.status === "invalid")
    log(`ignoring an unreadable ship record: ${savedRecord.detail}`);
  const saveRecord = async (next: ShipRecord): Promise<ShipRecord> => {
    const valid = shipRecordSchema.parse(next);
    await writeJsonAtomic(recordFile, valid);
    return valid;
  };

  const headBefore = await git.headSha(worktree);
  let record: ShipRecord | null = savedRecord.status === "ok" ? savedRecord.value : null;
  if (record !== null && record.pendingChangeset !== null && request.confirm && !dryRun) {
    // A crash left a changeset file that no commit holds. Return to the pristine tree.
    const pending = record.pendingChangeset;
    if (!(await existsInHead(exec, worktree, pending.path))) {
      await unstageAll(exec, worktree);
      const file = path.join(worktree, pending.path);
      const current = await readFile(file, "utf8").catch(() => null);
      if (current === pending.content) await rm(file, { force: true });
      log(`removed the unfinished changeset ${pending.path} from an earlier run`);
    }
    record = await saveRecord({ ...record, pendingChangeset: null });
  }

  // --- facts ---------------------------------------------------------------
  const branchNow = await git.currentBranch(worktree);
  const clean = (await git.statusPorcelain(worktree)).trim() === "";
  // The record is ours only while HEAD is the commit it names and nothing changed since.
  const resumedFrom: ShipRecord | null =
    record !== null && record.commitSha !== null && record.commitSha === headBefore && clean
      ? record
      : null;
  const resumed = resumedFrom !== null;
  const base = resumedFrom === null ? stateBase : resumedFrom.baseSha;
  let diff = await diffAgainstBase(exec, worktree, base);
  holder.progress = {
    baseSha: base,
    commitSha: resumed ? headBefore : null,
    rebased: resumedFrom?.rebased ?? false
  };

  /** The hash the checks and the review must match. After the commit it is the hash recorded then. */
  const codeHashOf = (current: DiffResult): string =>
    resumedFrom !== null &&
    resumedFrom.checkedDiffHash !== null &&
    current.diffHash === resumedFrom.committedDiffHash
      ? resumedFrom.checkedDiffHash
      : current.diffHash;

  let identity: ControllerIdentity;
  try {
    identity = await checkControllerIdentity(github, config.owner);
  } catch (error) {
    identity = { ok: false, reason: `Could not read the GitHub identity: ${errorMessage(error)}` };
  }
  let authorization: AuthorizationCheck;
  if (state.authorization === null) {
    authorization = { status: "missing" };
  } else if (!identity.ok) {
    authorization = { status: "unavailable", reason: "skipped: the owner identity check failed" };
  } else {
    try {
      authorization = recheckAuthorization(
        await github.fetchIssue(request.issue),
        state.authorization,
        identity.owner
      );
    } catch (error) {
      authorization = { status: "unavailable", reason: errorMessage(error) };
    }
  }

  const baseline = await readRefsBaseline(artifactsDir);
  const refViolations = async (): Promise<string[] | null> => {
    if (baseline === null || branchNow === null) return baseline === null ? null : [];
    const expected =
      resumedFrom?.commitSha != null
        ? baselineAfterCommit(baseline, branchNow, resumedFrom.commitSha)
        : baseline;
    return shipRefViolations(expected, await git.refsSnapshot(worktree), branchNow).map(
      (violation) => `${violation.kind} at ${violation.subject}`
    );
  };

  const review = await readArtifactJson(artifactsDir, ARTIFACTS.review, reviewArtifactSchema);
  const reviewArtifact: ReviewArtifact | null = review.status === "ok" ? review.value : null;
  const loopReportResult = await readArtifactJson(
    artifactsDir,
    CHECK_REPORT_FILE,
    checkReportSchema
  );
  const loopReport: CheckReport | null =
    loopReportResult.status === "ok" ? loopReportResult.value : null;
  const readShipReport = async (): Promise<CheckReport | null> => {
    const result = await readArtifactJson(shipDir, CHECK_REPORT_FILE, checkReportSchema);
    return result.status === "ok" ? result.value : null;
  };
  let shipReport = await readShipReport();

  const gateInput = async (over: {
    report: CheckReport | null;
    accept: ShipGateInput["checks"]["accept"];
    diff: DiffResult;
    codeHash: string;
    reviewHash: string | null;
    refs?: string[] | null;
  }): Promise<ShipGateInput> => ({
    confirm: request.confirm,
    checks: { report: over.report, accept: over.accept },
    diffHash: over.codeHash,
    changedPaths: filesOf(over.diff),
    identity,
    branch: { actual: branchNow, expected: state.branch },
    authorization,
    refViolations: over.refs === undefined ? await refViolations() : over.refs,
    planApproved: state.history.some((entry) => entry.event === "plan-approved"),
    review:
      reviewArtifact === null
        ? null
        : {
            verdict: reviewArtifact.review.verdict,
            blockingFindings: reviewArtifact.review.findings.filter((finding) => finding.blocking)
              .length,
            diffHash: reviewArtifact.diffHash
          },
    expectedReviewDiffHash: over.reviewHash
  });

  // --- gate (before any change) -------------------------------------------
  step("gate", "start");
  let codeHash = codeHashOf(diff);
  const firstReport =
    shipReport !== null && shipReport.passed && shipReport.diffHash === codeHash
      ? shipReport
      : (loopReport ?? shipReport);
  const gate = evaluateShipGate(
    await gateInput({
      report: resumed ? shipReport : firstReport,
      accept: resumed ? ["ship"] : ["loop", "ship"],
      diff,
      codeHash,
      reviewHash: resumedFrom?.rebased === true ? null : codeHash
    })
  );
  if (!dryRun && !gate.ok) {
    step("gate", "failed", gate.failures.map((failure) => failure.kind).join(", "));
    return { status: "refused", failures: gate.failures };
  }
  step("gate", gate.ok ? "done" : "failed", gate.ok ? undefined : "dry run: gate would refuse");
  if (!dryRun) await deps.beforeChange?.();

  // --- changeset decision --------------------------------------------------
  const workspaces = await discoverWorkspaces(worktree);
  const decided: ChangesetDecision = changesetDecision(filesOf(diff), planned, workspaces);
  const outcomeOf = async (decision: ChangesetDecision): Promise<ChangesetOutcome | null> => {
    switch (decision.kind) {
      case "none":
        return { kind: "none", reason: decision.reason };
      case "skip-label":
        return { kind: "skip-label", reason: decision.reason, label: decision.label };
      case "invalid":
        return null;
      case "file": {
        let name = changesetFileName(planned.pr.slug);
        for (let n = 2; await exists(path.join(worktree, CHANGESET_DIR, name)); n += 1) {
          name = changesetFileName(`${planned.pr.slug}-${n}`);
        }
        return {
          kind: "file",
          reason: decision.reason,
          path: `${CHANGESET_DIR}/${name}`,
          packages: [...decision.packages],
          bump: decision.bump
        };
      }
    }
  };
  // After the commit the diff already carries the changeset, so the recorded outcome is the truth.
  const outcome: ChangesetOutcome | null =
    resumedFrom === null ? await outcomeOf(decided) : resumedFrom.changeset;
  const changesetText =
    outcome?.kind === "file"
      ? renderChangeset({
          packages: outcome.packages,
          bump: outcome.bump,
          summary: planned.summary
        })
      : null;

  // --- message, body ---------------------------------------------------------
  const identityProblem = async (): Promise<string | null> => {
    const who = await readGitIdentity(exec, worktree);
    if (who.name === "" || who.email === "") {
      return "git user.name and user.email are not both set, so the commit has no author.";
    }
    return isAiIdentity(who.name, who.email)
      ? `git identity '${who.name} <${who.email}>' looks like an AI or tool identity. Commits use the human contributor.`
      : null;
  };

  const template = await readFile(path.join(worktree, TEMPLATE_PATH), "utf8").catch(
    (error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    }
  );
  if (template === null) {
    return stop({ kind: "state", message: `${TEMPLATE_PATH} is missing in the worktree.` });
  }
  const commit = buildCommitMessage(
    commitInputFor({
      plan: planned,
      reviewTitle: reviewArtifact?.review.prDraft.title,
      issue: request.issue
    })
  );
  const render = (reports: readonly CheckReport[]) =>
    buildPrBody({
      template,
      issue: request.issue,
      plan: planned,
      reports,
      review: reviewArtifact?.review ?? null,
      changeset:
        outcome?.kind === "file"
          ? {
              kind: "file",
              packages: outcome.packages,
              bump: outcome.bump,
              reason: outcome.reason,
              unlisted: decided.kind === "file" ? decided.unlisted : []
            }
          : (outcome ?? decided),
      changesetPath: outcome?.kind === "file" ? outcome.path : null
    });
  const reportsFor = (hash: string): CheckReport[] =>
    [loopReport, shipReport].filter(
      (report): report is CheckReport => report !== null && report.diffHash === hash
    );
  const attributionOf = (body: string) =>
    findAttributionViolations({
      "commit-message": commit.text,
      "pr-title": commit.header,
      "pr-body": body,
      changeset: changesetText
    });
  const writeTextArtifacts = async (body: string): Promise<void> => {
    await writeArtifactText(artifactsDir, PR_BODY_FILE, body);
    await writeArtifactText(artifactsDir, COMMIT_MESSAGE_FILE, commit.text);
  };
  const commitlint = async (): Promise<{ ok: boolean; output: string }> => {
    const result = await exec({
      argv: ["pnpm", "exec", "commitlint"],
      cwd: worktree,
      input: commit.text,
      timeoutMs: timeouts.commitlintMs
    });
    return {
      ok: result.code === 0,
      output: [result.stdout, result.stderr]
        .filter((part) => part !== "")
        .join("\n")
        .trim()
    };
  };

  // --- dry run ---------------------------------------------------------------
  if (dryRun) {
    const body = render(reportsFor(codeHash));
    const violations = attributionOf(body.body);
    const lint = await commitlint();
    await writeTextArtifacts(body.body);
    const files = uniqueSorted([
      ...filesOf(diff),
      ...(outcome?.kind === "file" ? [outcome.path] : [])
    ]);
    const shipPlan: ShipPlan = shipPlanSchema.parse({
      version: 1,
      issue: request.issue,
      dryRun: true,
      generatedAt: clock.now().toISOString(),
      branch: branchNow,
      baseSha: base,
      gate: { ok: gate.ok, failures: gate.failures },
      changeset: outcome ?? {
        kind: "invalid",
        reason: decided.kind === "invalid" ? decided.reason : "invalid"
      },
      changesetText,
      commitHeader: commit.header,
      pullRequest: { base: BASE_BRANCH, draft: true, title: commit.header },
      files,
      bodyHeadings: body.headings,
      unfilledHeadings: body.unfilled,
      attribution: violations,
      commitlint: lint,
      gitIdentityProblem: await identityProblem(),
      pushes: `origin ${branchNow ?? ""}`.trim()
    });
    const planFile = path.join(artifactsDir, SHIP_PLAN_FILE);
    await writeJsonAtomic(planFile, shipPlan);
    return {
      status: "dry-run",
      plan: shipPlan,
      files: {
        plan: planFile,
        prBody: path.join(artifactsDir, PR_BODY_FILE),
        commitMessage: path.join(artifactsDir, COMMIT_MESSAGE_FILE)
      }
    };
  }

  // From here on the run changes things.
  if (outcome === null) {
    return stop({
      kind: "changeset-invalid",
      message: decided.kind === "invalid" ? decided.reason : "The changeset cannot be decided."
    });
  }
  const branch = branchNow;
  if (branch === null) return stop({ kind: "state", message: "HEAD is detached." });

  step("identity", "start");
  const problem = await identityProblem();
  if (problem !== null) return stop({ kind: "git-identity", message: problem });
  step("identity", "done");

  let currentRecord: ShipRecord = resumedFrom ?? {
    version: 1,
    branch,
    baseSha: base,
    changeset: outcome,
    pendingChangeset: null,
    checkedDiffHash: null,
    committedDiffHash: null,
    commitSha: null,
    rebased: false,
    pullRequest: null
  };
  const persist = async (patch: Partial<ShipRecord>): Promise<void> => {
    currentRecord = await saveRecord({ ...currentRecord, ...patch });
  };
  let rollbackFile: { path: string; content: string } | null = null;

  /** Undo what a failed step before the commit changed: the index and the changeset file. */
  const rollback = async (): Promise<void> => {
    await unstageAll(exec, worktree);
    if (rollbackFile !== null) {
      const file = path.join(worktree, rollbackFile.path);
      const current = await readFile(file, "utf8").catch(() => null);
      if (current === rollbackFile.content) await rm(file, { force: true });
      rollbackFile = null;
    }
    await persist({ pendingChangeset: null });
  };
  const runCheckJob = <T>(task: () => Promise<T>): Promise<T> =>
    deps.checkSlot === undefined ? task() : deps.checkSlot(task);
  const shipChecks = (baseSha: string): Promise<CheckReport> =>
    runCheckJob(() =>
      runChecks({ worktree, kind: "ship", config, exec, baseSha, artifactsDir: shipDir, clock })
    );

  // --- ship checks ------------------------------------------------------------
  let commitSha: string = headBefore;
  if (resumed) {
    step("checks", "skipped", "the commit exists; its checks are on record");
  } else {
    step("checks", "start");
    let report: CheckReport;
    if (
      shipReport !== null &&
      shipReport.passed &&
      shipReport.kind === "ship" &&
      shipReport.diffHash === diff.diffHash
    ) {
      report = shipReport;
      step("checks", "skipped", "a passed ship report matches the code");
    } else {
      report = await shipChecks(base);
      shipReport = report;
      diff = await diffAgainstBase(exec, worktree, base);
      if (!report.passed) {
        return stop({
          kind: "checks-failed",
          message: `The ship checks failed (${
            report.steps
              .filter((entry) => entry.code !== 0)
              .map((entry) => entry.argv.join(" "))
              .join(", ") || "no step"
          }).`,
          report
        });
      }
      step("checks", "done");
    }
    codeHash = diff.diffHash;
    const afterChecks = evaluateShipGate(
      await gateInput({
        report,
        accept: ["ship"],
        diff,
        codeHash,
        reviewHash: currentRecord.rebased ? null : codeHash
      })
    );
    if (!afterChecks.ok) {
      step("gate", "failed", afterChecks.failures.map((failure) => failure.kind).join(", "));
      return { status: "refused", failures: afterChecks.failures };
    }
  }

  // --- changeset file ------------------------------------------------------------
  let finalDiff = diff;
  if (!resumed && outcome.kind === "file" && changesetText !== null) {
    step("changeset", "start", outcome.path);
    const violations = findAttributionViolations({
      "commit-message": null,
      "pr-title": null,
      "pr-body": null,
      changeset: changesetText
    });
    if (violations.length > 0) {
      return stop({
        kind: "attribution",
        message: `The changeset text carries AI attribution: ${violations[0]?.message ?? ""}`,
        violations
      });
    }
    // Write the intent first. A crash between here and the commit leaves a record the next run can undo.
    await persist({
      pendingChangeset: { path: outcome.path, content: changesetText },
      changeset: outcome
    });
    await mkdir(path.join(worktree, CHANGESET_DIR), { recursive: true });
    await writeFile(path.join(worktree, outcome.path), changesetText, "utf8");
    rollbackFile = { path: outcome.path, content: changesetText };
    finalDiff = await diffAgainstBase(exec, worktree, base);
    step("changeset", "done");
  } else {
    step("changeset", "skipped", outcome.kind);
  }

  // --- message and body -------------------------------------------------------------
  step("message", "start");
  const body = render(reportsFor(codeHash));
  const violations = attributionOf(body.body);
  if (violations.length > 0) {
    await rollback();
    return stop({
      kind: "attribution",
      message: `AI attribution found in the ${violations.map((entry) => entry.source).join(", ")}: ${violations[0]?.message ?? ""}`,
      violations
    });
  }
  await writeTextArtifacts(body.body);
  if (!resumed) {
    const lint = await commitlint();
    if (!lint.ok) {
      await rollback();
      return stop({
        kind: "commit-message-invalid",
        message: "commitlint rejects the commit message.",
        output: lint.output
      });
    }
  }
  step("message", "done");

  // --- stage and commit ----------------------------------------------------------------
  if (resumed) {
    step("stage", "skipped");
    step("commit", "skipped", "already committed");
  } else {
    step("stage", "start");
    const files = filesOf(finalDiff);
    const forbidden = files.filter((file) => isProtectedPath(file));
    if (forbidden.length > 0) {
      await rollback();
      return stop({
        kind: "stage-mismatch",
        message: `Protected paths are in the diff: ${forbidden.join(", ")}.`,
        unexpected: forbidden,
        missing: []
      });
    }
    await unstageAll(exec, worktree);
    const added = await stageFiles(exec, worktree, files);
    const staged = added.ok ? await stagedPaths(exec, worktree) : null;
    if (staged === null) {
      await rollback();
      return stop({ kind: "error", message: `git add failed: ${added.log}` });
    }
    const expected = new Set(files);
    const unexpected = staged.filter((file) => !expected.has(file));
    const stagedSet = new Set(staged);
    // At the base commit the index must hold every listed file. Later it holds only what is new.
    const missing = headBefore === base ? files.filter((file) => !stagedSet.has(file)) : [];
    if (unexpected.length > 0 || missing.length > 0) {
      await rollback();
      return stop({
        kind: "stage-mismatch",
        message: `The staged files differ from the diff (unexpected: ${unexpected.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}).`,
        unexpected,
        missing
      });
    }
    step("stage", "done", `${staged.length} file(s)`);

    if (staged.length === 0) {
      commitSha = headBefore;
      step("commit", "skipped", "everything is already committed");
    } else {
      step("commit", "start");
      const made = await commitStaged(
        exec,
        worktree,
        path.join(artifactsDir, COMMIT_MESSAGE_FILE),
        timeouts.commitMs
      );
      if (!made.ok) {
        await rollback();
        const hook = !made.timedOut && !looksLikeGitError(made.log);
        return hook
          ? stop({
              kind: "hook-failed",
              hook: "commit",
              message: "A commit hook refused the commit.",
              log: made.log
            })
          : stop({ kind: "commit-failed", message: "git commit failed.", log: made.log });
      }
      commitSha = await git.headSha(worktree);
      step("commit", "done", commitSha.slice(0, 12));
    }
    const committed = await diffAgainstBase(exec, worktree, base);
    await persist({
      branch,
      baseSha: base,
      changeset: outcome,
      pendingChangeset: null,
      checkedDiffHash: codeHash,
      committedDiffHash: committed.diffHash,
      commitSha,
      rebased: false
    });
    rollbackFile = null;
    holder.progress = { baseSha: base, commitSha, rebased: false };
    if ((await git.statusPorcelain(worktree)).trim() !== "") {
      return stop({
        kind: "commit-failed",
        message: "The worktree is not clean after the commit. Look at it before shipping again.",
        log: await git.statusPorcelain(worktree)
      });
    }
  }
  // --- fetch and rebase ---------------------------------------------------------------------
  step("fetch", "start");
  try {
    await git.fetch(worktree, "origin", BASE_BRANCH);
  } catch (error) {
    return stop({ kind: "fetch-failed", message: errorMessage(error) });
  }
  step("fetch", "done");

  let baseNow = base;
  let rebased = currentRecord.rebased;
  if (await git.isAncestor(worktree, `origin/${BASE_BRANCH}`, "HEAD")) {
    step("rebase", "skipped", "the branch is up to date");
  } else {
    step("rebase", "start");
    const result = await rebaseOnto(exec, worktree, `origin/${BASE_BRANCH}`, timeouts.rebaseMs);
    if (!result.ok) {
      const files = await conflictedFiles(exec, worktree);
      await rebaseAbort(exec, worktree);
      return stop({
        kind: "rebase-conflict",
        message:
          files.length > 0
            ? `Rebase onto origin/${BASE_BRANCH} conflicts in ${files.join(", ")}. The rebase was aborted.`
            : `Rebase onto origin/${BASE_BRANCH} failed. The rebase was aborted.`,
        files,
        log: result.log
      });
    }
    const newBase = await revParse(exec, worktree, `origin/${BASE_BRANCH}`);
    if (newBase === null) throw new Error(`cannot resolve origin/${BASE_BRANCH} after the rebase`);
    baseNow = newBase;
    rebased = true;
    commitSha = await git.headSha(worktree);
    holder.progress = { baseSha: baseNow, commitSha, rebased };
    step("rebase", "done", `onto ${newBase.slice(0, 12)}`);

    // The code changed under the checks: run them again, then ask the gate again.
    step("checks", "start", "after rebase");
    const rebasedReport = await shipChecks(baseNow);
    shipReport = rebasedReport;
    const rebasedDiff = await diffAgainstBase(exec, worktree, baseNow);
    await persist({
      baseSha: baseNow,
      commitSha,
      rebased: true,
      checkedDiffHash: rebasedReport.diffHash,
      committedDiffHash: rebasedDiff.diffHash
    });
    if (!rebasedReport.passed) {
      return stop({
        kind: "checks-failed",
        message: "The ship checks failed after the rebase.",
        report: rebasedReport
      });
    }
    step("checks", "done", "after rebase");
    const again = evaluateShipGate(
      await gateInput({
        report: rebasedReport,
        accept: ["ship"],
        diff: rebasedDiff,
        codeHash: rebasedDiff.diffHash,
        // The reviewed diff text differs after a rebase. The code is the same plus upstream.
        reviewHash: null,
        // The rebase moved HEAD and the branch ref on purpose.
        refs: []
      })
    );
    if (!again.ok) return { status: "refused", failures: again.failures };
    const rebasedBody = render(reportsFor(rebasedDiff.diffHash));
    const rebasedViolations = attributionOf(rebasedBody.body);
    if (rebasedViolations.length > 0) {
      return stop({
        kind: "attribution",
        message: `AI attribution found in the ${rebasedViolations.map((entry) => entry.source).join(", ")}.`,
        violations: rebasedViolations
      });
    }
    await writeTextArtifacts(rebasedBody.body);
  }

  // --- push ------------------------------------------------------------------------------------
  step("push", "start");
  const pushed = await pushBranch(exec, worktree, branch, timeouts.pushMs);
  if (!pushed.ok) {
    if (looksRejected(pushed.log)) {
      return stop({
        kind: "push-rejected",
        message: "The remote rejected the push. Nothing was forced.",
        log: pushed.log
      });
    }
    return /husky|hook|pre-push/i.test(pushed.log)
      ? stop({
          kind: "hook-failed",
          hook: "push",
          message: "A pre-push hook refused the push.",
          log: pushed.log
        })
      : stop({ kind: "push-failed", message: "git push failed.", log: pushed.log });
  }
  step("push", "done");

  // --- draft pull request --------------------------------------------------------------------------
  step("pull-request", "start");
  let pullRequest: { number: number; url: string };
  let reused = false;
  try {
    const existing = await github.findPullRequest(branch);
    if (existing === null) {
      pullRequest = await github.createPullRequest({
        base: BASE_BRANCH,
        head: branch,
        title: commit.header,
        bodyFile: path.join(artifactsDir, PR_BODY_FILE),
        draft: true
      });
    } else {
      pullRequest = existing;
      reused = true;
    }
  } catch (error) {
    return stop({ kind: "pull-request-failed", message: errorMessage(error) });
  }
  await persist({ pullRequest });
  step("pull-request", "done", reused ? `reused #${pullRequest.number}` : `#${pullRequest.number}`);

  let changesetResult: ShipChangesetResult;
  if (outcome.kind === "skip-label") {
    step("label", "start", outcome.label);
    let applied = true;
    let note: string | null = null;
    try {
      await github.addPullRequestLabel(pullRequest.number, outcome.label);
    } catch (error) {
      applied = false;
      note = errorMessage(error);
      log(`could not add '${outcome.label}': ${note}`);
    }
    step("label", applied ? "done" : "failed", note ?? undefined);
    changesetResult = { ...outcome, applied, labelNote: note };
  } else {
    step("label", "skipped");
    changesetResult = outcome;
  }

  return {
    status: "shipped",
    prUrl: pullRequest.url,
    prNumber: pullRequest.number,
    reusedPullRequest: reused,
    commitSha,
    branch,
    baseSha: baseNow,
    rebased,
    changeset: changesetResult
  };
};
