import type { GithubPull, JobState } from "@repo/desk/contracts";

import type { WorkItem } from "./work.model";
import { issueFlowOf, stageName } from "../flow/flow.steps";
import type { Translate } from "../i18n/i18n.t";
import { firstLine } from "../shell/shell.format";
import type { Route } from "../shell/shell.route";
import { statusLabelText } from "../status/status.chip";
import { GATE_REASON_KEY, issueStatusOf, reasonExcerpt, type Tone } from "../status/status.model";

/**
 * What a row, a card, or a palette entry says about a piece of work. One place, so the Inbox,
 * All work, and the item page name the same state the same way.
 */

/** The page of an item. */
export const routeOf = (item: WorkItem): Route =>
  item.kind === "issue"
    ? { view: "issue", issueNumber: item.summary.issueNumber }
    : { view: "job", jobId: item.job.id };

/** "#102", or "Job" for a desk job. */
export const refOf = (t: Translate, item: WorkItem): string =>
  item.kind === "issue"
    ? t("desk.issue.number", { number: item.summary.issueNumber })
    : t("desk.work.jobRef");

export const titleOf = (t: Translate, item: WorkItem): string => {
  if (item.kind === "job") return t(`desk.job.title.${item.job.kind}`, { id: item.job.id });
  return item.summary.readable ? (item.summary.title ?? t("desk.issue.untitled")) : "";
};

const JOB_TONE: Readonly<Record<JobState["status"], Tone>> = {
  running: "information",
  waiting: "attention",
  "needs-you": "danger",
  done: "success",
  cancelled: "neutral"
};

/** The gate a waiting job holds: a component's plan first, then its review. */
const jobGateKey = (job: JobState): string =>
  job.kind === "component" && job.stage === "plan"
    ? "desk.stage.plan-gate"
    : `desk.job.gate.${job.kind}`;

/** The one status of an item in words, with its tone. */
export function chipOf(
  t: Translate,
  item: WorkItem
): { readonly tone: Tone; readonly text: string } {
  if (item.kind === "issue") {
    const status = issueStatusOf(item.summary);
    return { tone: status.tone, text: statusLabelText(t, status.label) };
  }
  const { job } = item;
  const tone = JOB_TONE[job.status];
  switch (job.status) {
    case "waiting":
      return {
        tone,
        text: t("desk.chip.inStage", {
          stage: t(jobGateKey(job)),
          state: t("desk.chip.state.your-turn")
        })
      };
    case "needs-you":
      return {
        tone,
        text:
          job.stop === null
            ? t("desk.stage.needs-you")
            : t("desk.chip.stopped", { reason: t(`desk.job.stopShort.${job.stop.reason}`) })
      };
    case "running":
      return {
        tone,
        text: t("desk.chip.inStage", {
          stage: t(`desk.job.stage.${job.stage}`),
          state: t("desk.chip.state.running")
        })
      };
    case "done":
      return { tone, text: t("desk.stage.finished") };
    case "cancelled":
      return { tone, text: t("desk.stage.cancelled") };
  }
}

/** A PR's CI and new comments in a few words, from the last check or GitHub's own CI state. */
export function pullNote(t: Translate, pull: GithubPull): string | null {
  if (pull.check !== null) {
    return t("desk.inbox.reason.prChecked", {
      failing: pull.check.failingChecks.length,
      comments: pull.check.comments
    });
  }
  if (pull.ci.state === "failing")
    return t("desk.inbox.reason.prFailing", { count: pull.ci.failing });
  return null;
}

/** The second line: why the item waits, or what it does now. */
export function whyOf(t: Translate, item: WorkItem, pull: GithubPull | null = null): string {
  if (item.kind === "job") {
    const { job } = item;
    if (job.status === "needs-you" && job.stop !== null) return firstLine(job.stop.detail);
    if (job.status === "waiting") return t(`desk.inbox.reason.job.${job.kind}`);
    return "";
  }
  const { summary } = item;
  if (!summary.readable) return firstLine(summary.detail);
  if (summary.needsYouReason !== null) return reasonExcerpt(summary.needsYouReason);
  const status = issueStatusOf(summary);
  if (status.gateMode === "pr-open" && pull !== null) {
    const note = pullNote(t, pull);
    if (note !== null) return note;
  }
  const key = status.gateMode === null ? undefined : GATE_REASON_KEY[status.gateMode];
  return key === undefined
    ? statusLabelText(t, status.label)
    : t(key, { stage: stageName(t, issueFlowOf(summary), summary.stage) });
}

/** The words of the one button a row offers. Every button opens the item. */
export function actionOf(t: Translate, item: WorkItem): string {
  if (item.kind === "job") {
    if (item.job.status === "waiting") return t(`desk.inbox.action.job.${item.job.kind}`);
    return t(item.job.status === "needs-you" ? "desk.inbox.action.diagnose" : "desk.card.open");
  }
  const { summary } = item;
  if (!summary.readable) return t("desk.card.open");
  const status = issueStatusOf(summary);
  if (status.gateMode === "needs-you") {
    return t(
      summary.resumeStage === "intake" ? "desk.inbox.action.fix" : "desk.inbox.action.diagnose"
    );
  }
  switch (status.gateMode) {
    case "plan-gate":
      return t("desk.card.reviewPlan");
    case "pr-review":
      return t("desk.card.reviewShip");
    case "pr-open":
      return t("desk.inbox.action.checkPr");
    default:
      return t("desk.card.open");
  }
}
