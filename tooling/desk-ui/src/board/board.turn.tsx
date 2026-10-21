import type { IssueSummary } from "@repo/desk/contracts";
import { Button, Card, buttonVariants } from "@repo/ui";
import { useId, useRef, useState, type ReactNode } from "react";

import { useContinueIssue, type ApprovePlans } from "./board.actions";
import { NextAction } from "./board.card";
import { useLanguage, useT, type Translate } from "../i18n/i18n.t";
import { firstLine, formatElapsed } from "../shell/shell.format";
import { useShortcuts } from "../shell/shell.keys";
import { RouteLink, useRouter } from "../shell/shell.router";
import { UNDO_WINDOW_MS } from "../shell/shell.undo";
import { StatusChip, statusLabelText } from "../status/status.chip";
import {
  GATE_REASON_KEY,
  PLAN_RISK_KEY,
  PLAN_RISK_TONE,
  gatePlanRisk,
  issueStatusOf,
  reasonExcerpt
} from "../status/status.model";

const OPEN_PRIMARY = buttonVariants({ appearance: "default", spacing: "compact" });
const OPEN_SUBTLE = buttonVariants({ appearance: "subtle", spacing: "compact" });

/** The second line of a row: the engine's reason for a stop, else what the gate waits for. */
function reasonOf(t: Translate, summary: IssueSummary): string {
  if (!summary.readable) return firstLine(summary.detail);
  if (summary.needsYouReason !== null) return reasonExcerpt(summary.needsYouReason);
  const status = issueStatusOf(summary);
  const key = status.gateMode === null ? undefined : GATE_REASON_KEY[status.gateMode];
  return key === undefined ? statusLabelText(t, status.label) : t(key);
}

function TurnRow({
  summary,
  first,
  now,
  approving,
  onApprove,
  titleRef,
  onFocusTitle
}: {
  readonly summary: IssueSummary;
  readonly first: boolean;
  readonly now: number;
  readonly approving: boolean;
  readonly onApprove: () => void;
  readonly titleRef: (element: HTMLAnchorElement | null) => void;
  readonly onFocusTitle: () => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const status = issueStatusOf(summary);
  const risk = gatePlanRisk(summary);
  const issue = { view: "issue", issueNumber: summary.issueNumber } as const;
  const since = summary.readable ? (summary.stageEnteredAt ?? summary.updatedAt) : null;
  const waited = since === null ? null : formatElapsed(now - Date.parse(since), language);

  return (
    <li
      className="desk-turn__row"
      data-first={first ? "true" : undefined}
      data-group={status.group}
    >
      <div className="desk-turn__main">
        <div className="desk-turn__top">
          {first && <span className="desk-turn__next">{t("desk.board.nextUp")}</span>}
          <RouteLink ref={titleRef} to={issue} className="desk-turn__title" onFocus={onFocusTitle}>
            <span className="desk-issue-number">
              {t("desk.issue.number", { number: summary.issueNumber })}
            </span>{" "}
            {summary.readable ? (summary.title ?? t("desk.issue.untitled")) : ""}
          </RouteLink>
          {risk === "high" && (
            <StatusChip tone={PLAN_RISK_TONE.high}>{t(PLAN_RISK_KEY.high)}</StatusChip>
          )}
        </div>
        <p className="desk-turn__why">{reasonOf(t, summary)}</p>
      </div>
      <div className="desk-turn__acts">
        {waited !== null && since !== null && (
          <time className="desk-turn__wait" dateTime={since}>
            <span aria-hidden="true">{waited}</span>
            <span className="desk-sr-only">{t("desk.card.inStage", { duration: waited })}</span>
          </time>
        )}
        {risk === "low" && (
          <Button
            appearance="subtle"
            spacing="compact"
            className="desk-turn__quick"
            aria-label={t("desk.board.quickApprove.label", { number: summary.issueNumber })}
            title={t("desk.board.quickApprove.help", { seconds: UNDO_WINDOW_MS / 1000 })}
            disabled={approving || (summary.readable && summary.busy)}
            onClick={onApprove}
          >
            {t("desk.board.quickApprove")}
          </Button>
        )}
        {summary.readable ? (
          <NextAction
            summary={summary}
            action={status.primaryAction}
            primary={first}
            withOpen={false}
          />
        ) : (
          <RouteLink to={issue} className={first ? OPEN_PRIMARY : OPEN_SUBTLE}>
            {t("desk.card.open")}
          </RouteLink>
        )}
      </div>
    </li>
  );
}

function TurnGroup({
  group,
  name,
  note,
  rows,
  offset,
  action,
  ...row
}: {
  readonly group: "needs-you" | "waiting";
  readonly name: string;
  readonly note: string;
  readonly rows: readonly IssueSummary[];
  /** The index of the first row in the whole inbox. */
  readonly offset: number;
  readonly action?: ReactNode;
  readonly now: number;
  readonly pending: ReadonlySet<number>;
  readonly approve: (issue: number) => void;
  readonly titleRef: (issue: number) => (element: HTMLAnchorElement | null) => void;
  readonly focusAt: (index: number) => void;
}) {
  const heading = useId();
  return (
    <section className="desk-turn__group" aria-labelledby={heading} data-group={group}>
      <div className="desk-turn__head">
        <h2 id={heading}>
          {name} <span className="desk-turn__count">{rows.length}</span>
        </h2>
        <span className="desk-turn__note">{note}</span>
        {action}
      </div>
      <ul className="desk-turn__rows">
        {rows.map((summary, index) => (
          <TurnRow
            key={summary.issueNumber}
            summary={summary}
            first={offset + index === 0}
            now={row.now}
            approving={row.pending.has(summary.issueNumber)}
            onApprove={() => row.approve(summary.issueNumber)}
            titleRef={row.titleRef(summary.issueNumber)}
            onFocusTitle={() => row.focusAt(offset + index)}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * Your turn: what stopped, then the decisions at a gate, oldest first. The first row is next
 * up and holds the one primary button. J and K move between rows; A approves a low-risk plan
 * (any other plan opens), C continues a stopped issue.
 */
export function TurnInbox({
  needsYou,
  decisions,
  batchCount,
  onAskBatch,
  approvals,
  searching,
  now
}: {
  readonly needsYou: readonly IssueSummary[];
  readonly decisions: readonly IssueSummary[];
  /** Low-risk plans the batch would approve. The batch link shows from two. */
  readonly batchCount: number;
  readonly onAskBatch: () => void;
  readonly approvals: ApprovePlans;
  readonly searching: boolean;
  readonly now: number;
}) {
  const t = useT();
  const { navigate } = useRouter();
  const continueIssue = useContinueIssue();
  const rows = [...needsYou, ...decisions];
  const titles = useRef(new Map<number, HTMLAnchorElement>());
  const [cursor, setCursor] = useState<number | null>(null);
  const target = rows[Math.min(cursor ?? 0, rows.length - 1)];

  const move = (step: 1 | -1): void => {
    if (rows.length === 0) return;
    const next = cursor === null ? 0 : Math.max(0, Math.min(rows.length - 1, cursor + step));
    setCursor(next);
    const issue = rows[next];
    if (issue !== undefined) titles.current.get(issue.issueNumber)?.focus();
  };

  useShortcuts([
    { key: "j", run: () => move(1), labelKey: "desk.board.keys.next" },
    { key: "k", run: () => move(-1), labelKey: "desk.board.keys.previous" },
    {
      key: "a",
      labelKey: "desk.board.keys.approve",
      run: () => {
        if (target === undefined) return;
        const risk = gatePlanRisk(target);
        if (risk === "low" && !approvals.pending.has(target.issueNumber)) {
          approvals.approve([target.issueNumber]);
        } else if (issueStatusOf(target).gateMode === "plan-gate") {
          navigate({ view: "issue", issueNumber: target.issueNumber });
        }
      }
    },
    {
      key: "c",
      labelKey: "desk.board.keys.continue",
      run: () => {
        if (target === undefined || !target.readable || target.busy) return;
        if (issueStatusOf(target).primaryAction === "continue") {
          void continueIssue(target.issueNumber);
        }
      }
    }
  ]);

  const shared = {
    now,
    pending: approvals.pending,
    approve: (issue: number) => approvals.approve([issue]),
    titleRef: (issue: number) => (element: HTMLAnchorElement | null) => {
      if (element === null) titles.current.delete(issue);
      else titles.current.set(issue, element);
    },
    focusAt: setCursor
  };

  return (
    <Card className="desk-turn">
      {needsYou.length > 0 && (
        <TurnGroup
          group="needs-you"
          name={t("desk.board.group.needs-you")}
          note={t("desk.board.turn.needsNote")}
          rows={needsYou}
          offset={0}
          {...shared}
        />
      )}
      {decisions.length > 0 && (
        <TurnGroup
          group="waiting"
          name={t("desk.board.turn.decisions")}
          note={t("desk.board.turn.decisionsNote")}
          rows={decisions}
          offset={needsYou.length}
          action={
            batchCount > 1 && (
              <Button
                appearance="link"
                spacing="compact"
                className="desk-turn__batch"
                onClick={onAskBatch}
              >
                {t("desk.board.batch.open", { count: batchCount })}
              </Button>
            )
          }
          {...shared}
        />
      )}
      {rows.length === 0 && (
        <p className="desk-turn__empty">
          {searching ? t("desk.board.noMatch") : t("desk.board.turn.empty")}
        </p>
      )}
    </Card>
  );
}
