import { loopSteps, stepOf, type IssueState, type StageId } from "../contracts";
import { statusMarker } from "./github.authorization";
import type { GhClient } from "./github.gh";
import { restCommentSchema, type StatusCommentResult } from "./github.types";

export interface StatusInput {
  readonly state: IssueState;
  /** Why the issue waits for the owner. Shown only while it does. */
  readonly needsYouReason?: string | null;
}

/** Intake, setup, the steps of the issue's flow, and `shipped`. */
const forwardOrder = (state: IssueState): StageId[] => [
  "intake",
  "setup",
  ...state.flowSnapshot.flow.steps.map((step) => step.id),
  "shipped"
];

/** The forward-order position that "current" refers to, or -1 before any stage. */
const positionOf = (state: IssueState, order: readonly StageId[]): number => {
  const direct = order.indexOf(state.stage);
  if (direct !== -1) return direct;
  const via = state.resumeStage === null ? -1 : order.indexOf(state.resumeStage);
  if (via !== -1) return via;
  const seen = state.history.map((event) => order.indexOf(event.stage));
  return Math.max(-1, ...seen);
};

const oneLine = (text: string, max = 300): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
};

/**
 * Pure. Markdown for the one status comment of an issue: stage timeline, loop
 * counts with the limits of the issue's flow, authorization and the reason for waiting.
 * No footer or signature.
 */
export const renderStatusComment = ({ state, needsYouReason = null }: StatusInput): string => {
  const order = forwardOrder(state);
  const position = positionOf(state, order);
  // Shipped, or a flow without a ship step that ran every step.
  const ranAll = state.stage === "shipped" || state.stage === "finished";
  const timeline = order
    .filter((stage) => stage !== "shipped")
    .map((stage) => {
      const index = order.indexOf(stage);
      let mark = "pending";
      if (ranAll || index < position) mark = "done";
      else if (index === position && state.stage !== "cancelled") {
        mark = state.stage === "needs-you" ? "needs you" : state.status;
      }
      return `- \`${stage}\`: ${mark}`;
    });

  const lines = [
    statusMarker(state.issueNumber),
    "## Agent desk status",
    "",
    `Stage: \`${state.stage}\` (${state.status})`
  ];
  if (state.branch) lines.push(`Branch: \`${state.branch}\``);
  if (state.prUrl) lines.push(`Draft PR: ${state.prUrl}`);
  lines.push("", "### Timeline", ...timeline, "");
  const waiting = stepOf(state.flowSnapshot, state.stage);
  lines.push(
    "### Loops",
    ...loopSteps(state.flowSnapshot).map(
      (step) => `- ${step.id}: ${state.loops[step.id] ?? 0} of ${step.loopBack.limit}`
    ),
    ...(waiting?.kind === "pr-wait"
      ? [`- PR rounds: ${state.prRounds ?? 0} of ${waiting.maxRounds}`]
      : []),
    ""
  );

  if (state.stage === "needs-you" && needsYouReason !== null) {
    lines.push("### Needs you", oneLine(needsYouReason), "");
  }

  if (state.authorization) {
    const { actor, override, labeledAt } = state.authorization;
    lines.push(
      "### Authorization",
      override
        ? `Run started by ${actor} with the owner override. No \`ready-for-agent\` label event was required.`
        : `Authorized by ${actor} through the \`ready-for-agent\` label on ${labeledAt}.`,
      ""
    );
  }

  const latest = state.history.at(-1);
  if (latest) {
    lines.push(
      "### Latest",
      `${latest.event} at \`${latest.stage}\`${latest.note ? `: ${oneLine(latest.note)}` : ""}`,
      ""
    );
  }
  lines.push(`Updated: ${state.updatedAt}`);
  return `${lines.join("\n")}\n`;
};

/**
 * Create the status comment, or edit it in place. Only a comment by `viewer`
 * (the account `gh` uses) that carries the marker counts as the desk's own.
 */
export const upsertStatusComment = async (
  gh: GhClient,
  repository: string,
  viewer: string,
  issueNumber: number,
  body: string
): Promise<StatusCommentResult> => {
  const marker = statusMarker(issueNumber);
  if (!body.includes(marker)) throw new Error("Status comment body must carry its marker");
  const comments = await gh.apiPages(
    restCommentSchema,
    `repos/${repository}/issues/${issueNumber}/comments`
  );
  const existing = comments.find(
    (comment) =>
      comment.user?.login.toLowerCase() === viewer.toLowerCase() && comment.body.includes(marker)
  );
  if (existing === undefined) {
    const created = await gh.api(
      restCommentSchema,
      `repos/${repository}/issues/${issueNumber}/comments`,
      {
        method: "POST",
        body: { body }
      }
    );
    return { action: "created", commentId: created.id };
  }
  if (existing.body === body) return { action: "unchanged", commentId: existing.id };
  await gh.api(restCommentSchema, `repos/${repository}/issues/comments/${existing.id}`, {
    method: "PATCH",
    body: { body }
  });
  return { action: "updated", commentId: existing.id };
};
