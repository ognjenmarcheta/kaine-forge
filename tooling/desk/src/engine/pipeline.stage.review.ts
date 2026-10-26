import path from "node:path";
import { z } from "zod";

import { CHECK_REPORT_FILE, checkReportSchema } from "../check";
import {
  reviewFindingSchema,
  reviewerOutputSchema,
  type ReviewFinding,
  type ReviewerOutput
} from "../contracts";
import { agentStep } from "./pipeline.agent";
import {
  ARTIFACTS,
  readArtifactJson,
  readPlan,
  writeArtifactJson,
  writeArtifactText
} from "./pipeline.artifacts";
import { recordCheckoutLessons, reviewLessons } from "./pipeline.lessons";
import { locateFindings } from "./pipeline.review-locations";
import { workspacesForPlan } from "./pipeline.stage.build";

/** `review.json`: the validated review plus the findings the engine rejected. */
export const reviewArtifactSchema = z
  .object({
    review: reviewerOutputSchema,
    rejected: z.array(z.object({ finding: reviewFindingSchema, reason: z.string() })),
    /** The worktree diff the reviewer saw. */
    diffHash: z.string().regex(/^[0-9a-f]{64}$/)
  })
  .strict();
export type ReviewArtifact = z.infer<typeof reviewArtifactSchema>;

const FINDING_LIMIT = 40;

const describeFinding = (finding: ReviewFinding): string =>
  `- ${finding.file}:${finding.line} [${finding.severity}, ${finding.section}] ${finding.summary}${
    finding.fix.trim() === "" ? "" : `\n  Suggested fix: ${finding.fix}`
  }`;

/** What the builder reads after a review that asks for changes. */
export const reviewFeedbackText = (
  review: ReviewerOutput,
  findings: readonly ReviewFinding[]
): string => {
  const blocking = findings.filter((finding) => finding.blocking);
  const listed = (blocking.length > 0 ? blocking : findings).slice(0, FINDING_LIMIT);
  return [
    "The reviewer asks for changes. Verify each finding against the code and fix the valid ones. If a finding is wrong, leave the code as it is and say why in `notes`.",
    "",
    listed.length === 0
      ? `Reviewer summary: ${review.plainLanguage}`
      : listed.map(describeFinding).join("\n")
  ].join("\n");
};

/**
 * Review: a fresh, read-only reviewer reads `diff.patch` and the plan. The
 * diff hash and every ref must be the same after the run. Findings that point
 * outside the diff are rejected: a non-blocking one is dropped, a blocking one
 * stops the issue, because the engine cannot act on a claim it cannot locate. Requested
 * changes go to the step's loop-back target.
 */
export const reviewStage = agentStep({
  schema: reviewerOutputSchema,
  prepare: async (context, _step, agent) => {
    const { deps } = context;
    const state = context.state();
    const plan = await readPlan(context.artifactsDir);
    if (plan.status !== "ok") {
      return {
        kind: "needs-you",
        reason: `Review cannot start: ${plan.status === "missing" ? "plan.json is missing" : plan.detail}. Continue from plan.`
      };
    }
    if (state.worktreePath === null || state.baseSha === null || state.baseSha === undefined) {
      return {
        kind: "needs-you",
        reason: "Review cannot start: there is no worktree or base commit. Continue from setup."
      };
    }

    let diff;
    try {
      diff = await deps.git.diffAgainstBase(state.worktreePath, state.baseSha);
    } catch (error) {
      return {
        kind: "needs-you",
        reason: `Review cannot read the diff: ${error instanceof Error ? error.message : "unknown error"}`
      };
    }
    if (diff.patch.trim() === "") {
      return { kind: "needs-you", reason: "There is no change to review. Continue from build." };
    }
    // The reviewer reads the check results instead of running checks, so they must describe this diff.
    const checks = await readArtifactJson(
      context.artifactsDir,
      CHECK_REPORT_FILE,
      checkReportSchema
    );
    if (checks.status !== "ok" || !checks.value.passed || checks.value.diffHash !== diff.diffHash) {
      return {
        kind: "needs-you",
        reason: `Review needs a passing check report for the current diff, and ${
          checks.status === "ok"
            ? "check-report.json is for another diff or failed"
            : `check-report.json is ${checks.status}`
        }. Run the checks again: pnpm desk continue ${context.issue} --from check`
      };
    }
    await writeArtifactText(context.artifactsDir, ARTIFACTS.diff, diff.patch);
    return {
      plan: plan.value,
      diffPath: path.join(context.artifactsDir, ARTIFACTS.diff),
      workspaces:
        agent.capabilities.preset === "run-checks"
          ? await workspacesForPlan(state.worktreePath, plan.value)
          : undefined
    };
  },
  // The reviewer is read-only, so the diff after its run is the diff it reviewed.
  finish: async (context, step, _agent, { result, diff }) => {
    const review = result.structured;
    const located = locateFindings(review.findings, diff.patch);
    const artifact: ReviewArtifact = {
      review,
      rejected: [...located.rejected],
      diffHash: diff.diffHash
    };
    await writeArtifactJson(context.artifactsDir, ARTIFACTS.review, artifact);
    const worktree = context.state().worktreePath;
    // Always set here: `prepare` refused a review without a worktree.
    if (worktree !== null) {
      await recordCheckoutLessons(context, reviewLessons(located.accepted), worktree);
    }

    const rejectedBlocking = located.rejected.filter((entry) => entry.finding.blocking);
    if (rejectedBlocking.length > 0) {
      return {
        kind: "needs-you",
        reason: `The reviewer reported blocking findings outside the diff, so the engine cannot act on them:\n${rejectedBlocking
          .map(
            (entry) =>
              `- ${entry.finding.file}:${entry.finding.line} ${entry.finding.summary} (${entry.reason})`
          )
          .join("\n")}\nRead review.json, then give feedback or continue.`,
        patch: { pendingFeedback: null }
      };
    }

    const blocking = located.accepted.filter((finding) => finding.blocking);
    const rejectedNote =
      located.rejected.length === 0
        ? ""
        : `; ${located.rejected.length} finding(s) outside the diff dropped`;
    if (blocking.length === 0 && review.verdict === "approve") {
      return {
        kind: "trigger",
        trigger: { type: "review-result", verdict: "approve" },
        event: "review-approved",
        note: `${located.accepted.length} non-blocking finding(s)${rejectedNote}`
      };
    }
    return {
      kind: "trigger",
      trigger: { type: "review-result", verdict: "changes" },
      event: "review-changes-requested",
      note: `${blocking.length} blocking finding(s)${rejectedNote}`,
      patch: {
        pendingFeedback: {
          target: step.loopBack?.to ?? step.id,
          source: "review",
          text: reviewFeedbackText(review, located.accepted)
        }
      }
    };
  }
});
