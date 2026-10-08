import type { IssueSummary } from "@repo/desk/contracts";
import { Button, Card, GitPullRequest, Spinner, buttonVariants } from "@repo/ui";
import { useState } from "react";

import { StageProgress } from "./board.progress";
import { useT } from "../i18n/i18n.t";
import { firstLine, safeHttpUrl } from "../shell/shell.format";
import { OverflowTooltip, useOverflow } from "../shell/shell.overflow";
import { RouteLink } from "../shell/shell.router";
import { TimeInStage } from "../shell/shell.time";
import { toastSettled } from "../shell/shell.toast";
import { useDesk } from "../state/desk.provider";
import { IssueStatusChip } from "../status/status.chip";
import {
  issueStatusOf,
  reasonExcerpt,
  type PrimaryAction,
  type ReadableSummary
} from "../status/status.model";

const LINK_BUTTON = buttonVariants({ appearance: "default", spacing: "compact" });
const SUBTLE_LINK_BUTTON = buttonVariants({ appearance: "subtle", spacing: "compact" });

/** The next step of a card. Only these buttons and the title are interactive, not the card. */
function NextAction({
  summary,
  action
}: {
  readonly summary: ReadableSummary;
  readonly action: PrimaryAction;
}) {
  const t = useT();
  const { act } = useDesk();
  const [pending, setPending] = useState(false);
  const issue = { view: "issue", issueNumber: summary.issueNumber } as const;
  const prUrl = safeHttpUrl(summary.prUrl);

  switch (action) {
    case "continue":
      return (
        <>
          <Button
            spacing="compact"
            disabled={pending || summary.busy}
            onClick={() => {
              setPending(true);
              void act(summary.issueNumber, { action: "continue" }, { wait: false })
                .then((settled) => toastSettled(t, summary.issueNumber, "continue", settled))
                .finally(() => setPending(false));
            }}
          >
            {t("desk.gate.needsYou.continue")}
          </Button>
          <RouteLink to={issue} className={SUBTLE_LINK_BUTTON}>
            {t("desk.card.open")}
          </RouteLink>
        </>
      );
    case "review-plan":
      return (
        <RouteLink to={issue} className={LINK_BUTTON}>
          {t("desk.card.reviewPlan")}
        </RouteLink>
      );
    case "review-ship":
      return (
        <RouteLink to={issue} className={LINK_BUTTON}>
          {t("desk.card.reviewShip")}
        </RouteLink>
      );
    case "working":
      return (
        <span className="desk-loading">
          <Spinner size="sm" label={t("desk.common.working")} aria-hidden="true" />
          <span>{t("desk.common.working")}</span>
        </span>
      );
    case "open-pr":
      return prUrl === null ? null : (
        <a href={prUrl} target="_blank" rel="noreferrer noopener" className={SUBTLE_LINK_BUTTON}>
          {t("desk.card.openPr")}
        </a>
      );
    case "open":
      return (
        <RouteLink to={issue} className={SUBTLE_LINK_BUTTON}>
          {t("desk.card.open")}
        </RouteLink>
      );
  }
}

function ReadableCard({
  summary,
  now
}: {
  readonly summary: ReadableSummary;
  readonly now: number;
}) {
  const t = useT();
  const status = issueStatusOf(summary);
  const title = summary.title ?? t("desk.issue.untitled");
  const reason = summary.needsYouReason === null ? null : reasonExcerpt(summary.needsYouReason);
  const prUrl = safeHttpUrl(summary.prUrl);
  const [titleRef, titleCut] = useOverflow<HTMLSpanElement>(title);
  const [reasonRef, reasonCut] = useOverflow<HTMLParagraphElement>(reason ?? "");
  const [branchRef, branchCut] = useOverflow<HTMLElement>(summary.branch ?? "");

  return (
    <Card className="desk-card" data-group={status.group}>
      <h3 className="desk-card__title">
        <OverflowTooltip text={title} overflowing={titleCut}>
          <RouteLink to={{ view: "issue", issueNumber: summary.issueNumber }}>
            <span ref={titleRef} className="desk-card__clamp">
              <span className="desk-issue-number">
                {t("desk.issue.number", { number: summary.issueNumber })}
              </span>{" "}
              {title}
            </span>
          </RouteLink>
        </OverflowTooltip>
      </h3>
      <IssueStatusChip summary={summary} />
      <StageProgress progress={summary.progress} current={summary.currentNode} />
      {reason !== null && (
        <OverflowTooltip text={summary.needsYouReason ?? reason} overflowing={reasonCut}>
          <p ref={reasonRef} className="desk-card__reason">
            {reason}
          </p>
        </OverflowTooltip>
      )}
      <div className="desk-card__meta">
        {summary.branch !== null && (
          <OverflowTooltip text={summary.branch} overflowing={branchCut}>
            <code ref={branchRef} className="desk-card__branch">
              <span className="desk-sr-only">{t("desk.issue.branch")} </span>
              {summary.branch}
            </code>
          </OverflowTooltip>
        )}
        <TimeInStage summary={summary} now={now} />
        {prUrl !== null && status.primaryAction !== "open-pr" && (
          <a
            href={prUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="desk-card__pr"
            aria-label={t("desk.issue.openPr")}
          >
            <GitPullRequest aria-hidden="true" className="desk-icon" />
          </a>
        )}
      </div>
      <div className="desk-card__actions">
        <NextAction summary={summary} action={status.primaryAction} />
      </div>
    </Card>
  );
}

/** One issue on the board: where it is, what it needs, and the one next step. */
export function IssueCard({
  summary,
  now
}: {
  readonly summary: IssueSummary;
  readonly now: number;
}) {
  const t = useT();
  if (summary.readable) return <ReadableCard summary={summary} now={now} />;
  return (
    <Card className="desk-card" data-group="needs-you">
      <h3 className="desk-card__title">
        <RouteLink to={{ view: "issue", issueNumber: summary.issueNumber }}>
          {t("desk.issue.number", { number: summary.issueNumber })}
        </RouteLink>
      </h3>
      <IssueStatusChip summary={summary} />
      <p className="desk-card__reason">{firstLine(summary.detail)}</p>
    </Card>
  );
}
