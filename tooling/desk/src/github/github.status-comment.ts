import {
  DEFAULT_LOOP_LIMITS,
  PIPELINE,
  type IssueState,
  type LoopLimits,
  type Stage
} from "../contracts";
import { statusMarker } from "./github.authorization";
import type { GhClient } from "./github.gh";
import { restCommentSchema, type StatusCommentResult } from "./github.types";

export interface StatusInput {
  readonly state: IssueState;
  /** Why the issue waits for the owner. Shown only while it does. */
  readonly needsYouReason?: string | null;
  readonly limits?: LoopLimits;
}

const FORWARD_ORDER: readonly Stage[] = [...PIPELINE.nodes.map((node) => node.id), "shipped"];

/** The forward-order position that "current" refers to, or -1 before any stage. */
const positionOf = (state: IssueState): number => {
  const direct = FORWARD_ORDER.indexOf(state.stage);
  if (direct !== -1) return direct;
  const via = state.resumeStage === null ? -1 : FORWARD_ORDER.indexOf(state.resumeStage);
  if (via !== -1) return via;
  const seen = state.history.map((event) => FORWARD_ORDER.indexOf(event.stage));
  return Math.max(-1, ...seen);
};

const oneLine = (text: string, max = 300): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
};

/**
 * Pure. Markdown for the one status comment of an issue: stage timeline, loop
 * counts, authorization and the reason for waiting. No footer or signature.
 */
export const renderStatusComment = ({
  state,
  needsYouReason = null,
  limits = DEFAULT_LOOP_LIMITS
}: StatusInput): string => {
  const position = positionOf(state);
  const shipped = state.stage === "shipped";
  const timeline = FORWARD_ORDER.filter((stage) => stage !== "shipped").map((stage) => {
    const index = FORWARD_ORDER.indexOf(stage);
    let mark = "pending";
    if (shipped || index < position) mark = "done";
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
  lines.push(
    "### Loops",
    `- check: ${state.loops.check} of ${limits.check}`,
    `- review: ${state.loops.review} of ${limits.review}`,
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
