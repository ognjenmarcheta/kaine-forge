import type { IssueSummary } from "@repo/desk/contracts";
import { Button, Card } from "@repo/ui";
import { useId, useState, type ReactNode } from "react";

import { useLanguage, useT, type Translate } from "../i18n/i18n.t";
import { formatElapsed, safeHttpUrl } from "../shell/shell.format";
import { RouteLink } from "../shell/shell.router";
import { StatusChip, statusLabelText } from "../status/status.chip";
import { issueStatusOf } from "../status/status.model";

/** Running issues shown before "Show all". */
export const RUNNING_SHOWN = 3;

const titleOf = (t: Translate, summary: IssueSummary): string =>
  t("desk.issue.numbered", {
    number: summary.issueNumber,
    title: summary.readable ? (summary.title ?? t("desk.issue.untitled")) : ""
  }).trim();

function SideCard({
  title,
  count,
  children,
  action
}: {
  readonly title: string;
  readonly count: number;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  const heading = useId();
  return (
    <Card className="desk-side__card" aria-labelledby={heading} role="region">
      <div className="desk-side__head">
        <h2 id={heading} className="desk-side__title">
          {title} <span className="desk-side__count">{count}</span>
        </h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** What an agent works on now: the top few, the rest on request. A paused issue says so. */
export function RunningList({
  issues,
  now
}: {
  readonly issues: readonly IssueSummary[];
  readonly now: number;
}) {
  const t = useT();
  const { language } = useLanguage();
  const [all, setAll] = useState(false);
  const shown = all ? issues : issues.slice(0, RUNNING_SHOWN);
  return (
    <SideCard title={t("desk.board.group.running")} count={issues.length}>
      {issues.length === 0 ? (
        <p className="desk-side__empty">{t("desk.board.columnEmpty.running")}</p>
      ) : (
        <ul className="desk-side__list">
          {shown.map((summary) => {
            const paused = summary.readable && summary.paused;
            const since = summary.readable ? (summary.stageEnteredAt ?? summary.updatedAt) : null;
            const state = paused
              ? t("desk.board.side.paused", {
                  stage: summary.readable ? t(`desk.stage.${summary.stage}`) : ""
                })
              : statusLabelText(t, issueStatusOf(summary).label);
            return (
              <li key={summary.issueNumber} className="desk-side__item">
                <RouteLink
                  className="desk-side__name"
                  to={{ view: "issue", issueNumber: summary.issueNumber }}
                >
                  {titleOf(t, summary)}
                </RouteLink>
                <span className="desk-side__meta" data-paused={paused ? "true" : undefined}>
                  <span className="desk-side__glyph" aria-hidden="true" />
                  {since === null
                    ? state
                    : t("desk.board.side.now", {
                        state,
                        time: formatElapsed(now - Date.parse(since), language)
                      })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {issues.length > RUNNING_SHOWN && (
        <Button
          appearance="link"
          spacing="compact"
          className="desk-side__more"
          onClick={() => setAll((was) => !was)}
        >
          {all ? t("desk.board.showFewer") : t("desk.board.showAll", { count: issues.length })}
        </Button>
      )}
    </SideCard>
  );
}

/** Finished issues, folded: a summary line, and the list behind Show. */
export function DoneList({ issues }: { readonly issues: readonly IssueSummary[] }) {
  const t = useT();
  const list = useId();
  const [open, setOpen] = useState(false);
  const shipped = issues.filter((summary) => summary.readable && summary.stage === "shipped");
  return (
    <SideCard
      title={t("desk.board.group.done")}
      count={issues.length}
      action={
        issues.length > 0 && (
          <Button
            appearance="link"
            spacing="compact"
            aria-expanded={open}
            aria-controls={open ? list : undefined}
            onClick={() => setOpen((was) => !was)}
          >
            {open ? t("desk.board.side.hide") : t("desk.board.side.show")}
          </Button>
        )
      }
    >
      <p className="desk-side__empty">
        {issues.length === 0
          ? t("desk.board.side.doneNone")
          : t("desk.board.side.doneSummary", {
              shipped: shipped.length,
              cancelled: issues.length - shipped.length
            })}
      </p>
      {open && (
        <ul id={list} className="desk-side__list">
          {issues.map((summary) => {
            const status = issueStatusOf(summary);
            const pr = summary.readable ? safeHttpUrl(summary.prUrl) : null;
            return (
              <li key={summary.issueNumber} className="desk-side__item">
                <RouteLink
                  className="desk-side__name"
                  to={{ view: "issue", issueNumber: summary.issueNumber }}
                >
                  {titleOf(t, summary)}
                </RouteLink>
                <span className="desk-side__meta">
                  <StatusChip tone={status.tone}>{statusLabelText(t, status.label)}</StatusChip>
                  {pr !== null && (
                    <a href={pr} target="_blank" rel="noreferrer noopener">
                      {t("desk.card.openPr")}
                    </a>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SideCard>
  );
}
