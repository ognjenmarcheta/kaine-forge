import path from "node:path";
import { z } from "zod";

import {
  reviewFindingSchema,
  reviewerOutputSchema,
  type ReviewFinding,
  type ReviewerOutput
} from "../contracts";
import { diffAgainstBase } from "../git";
import { runAgentStage } from "./pipeline.agent";
import { ARTIFACTS, readPlan, writeArtifactJson, writeArtifactText } from "./pipeline.artifacts";
import { locateFindings } from "./pipeline.review-locations";
import type { StageHandler } from "./pipeline.types";

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
 * stops the issue, because the engine cannot act on a claim it cannot locate.
 */
export const reviewStage: StageHandler = async (context) => {
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
    diff = await diffAgainstBase(deps.exec, state.worktreePath, state.baseSha);
  } catch (error) {
    return {
      kind: "needs-you",
      reason: `Review cannot read the diff: ${error instanceof Error ? error.message : "unknown error"}`
    };
  }
  if (diff.patch.trim() === "") {
    return { kind: "needs-you", reason: "There is no change to review. Continue from build." };
  }
  await writeArtifactText(context.artifactsDir, ARTIFACTS.diff, diff.patch);

  const pending = state.pendingFeedback?.target === "review" ? state.pendingFeedback : null;
  const run = await runAgentStage(context, {
    role: "reviewer",
    schema: reviewerOutputSchema,
    readOnly: true,
    feedback: pending?.text,
    plan: plan.value,
    diffPath: path.join(context.artifactsDir, ARTIFACTS.diff)
  });
  if (!run.ok) {
    return run.aborted ? { kind: "aborted" } : { kind: "needs-you", reason: run.reason };
  }

  const review = run.result.structured;
  const located = locateFindings(review.findings, diff.patch);
  const artifact: ReviewArtifact = {
    review,
    rejected: [...located.rejected],
    diffHash: diff.diffHash
  };
  await writeArtifactJson(context.artifactsDir, ARTIFACTS.review, artifact);

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
      trigger: { type: "review-approve" },
      event: "review-approved",
      note: `${located.accepted.length} non-blocking finding(s)${rejectedNote}`,
      patch: { pendingFeedback: null }
    };
  }
  return {
    kind: "trigger",
    trigger: { type: "review-changes" },
    event: "review-changes-requested",
    note: `${blocking.length} blocking finding(s)${rejectedNote}`,
    patch: {
      pendingFeedback: {
        target: "build",
        source: "review",
        text: reviewFeedbackText(review, located.accepted)
      }
    }
  };
};
