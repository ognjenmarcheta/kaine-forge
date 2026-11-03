import type { GithubPull } from "@repo/desk/contracts";
import { Button } from "@repo/ui";

import { BUILTIN_FLOW_ID } from "../flow/flow.steps";
import { useLanguage, useT } from "../i18n/i18n.t";
import { formatElapsed } from "../shell/shell.format";
import { RouteLink, useRouter } from "../shell/shell.router";
import { UNDO_WINDOW_MS } from "../shell/shell.undo";
import { StatusChip } from "../status/status.chip";
import { PLAN_RISK_KEY, PLAN_RISK_TONE, gatePlanRisk } from "../status/status.model";
import { sinceOf, type WorkItem } from "../work/work.model";
import { actionOf, chipOf, refOf, routeOf, titleOf, whyOf } from "../work/work.present";

/** "New": a dot and the word, never the dot alone. */
export function UnreadMark() {
  const t = useT();
  return (
    <span className="dk-unread">
      <i aria-hidden="true" />
      {t("desk.inbox.new")}
    </span>
  );
}

/** How long the item waits, as the row shows it. `null` without a time. */
export function useWaited(item: WorkItem, now: number): string | null {
  const { language } = useLanguage();
  const since = sinceOf(item);
  return since === null ? null : formatElapsed(now - Date.parse(since), language);
}

/**
 * One row of the Inbox: the title, why it waits, its status and wait, and one button that opens
 * it. The first row is next up and holds the page's one primary button. A low-risk plan with
 * no open questions can be approved from here, with an undo window.
 */
export function InboxRow({
  item,
  first,
  unread,
  pull,
  now,
  approving,
  onApprove,
  titleRef,
  onFocusTitle
}: {
  readonly item: WorkItem;
  readonly first: boolean;
  readonly unread: boolean;
  /** The item's open PR on GitHub, when the desk listed it. */
  readonly pull: GithubPull | null;
  readonly now: number;
  readonly approving: boolean;
  readonly onApprove: () => void;
  readonly titleRef: (element: HTMLAnchorElement | null) => void;
  readonly onFocusTitle: () => void;
}) {
  const t = useT();
  const { navigate } = useRouter();
  const chip = chipOf(t, item);
  const waited = useWaited(item, now);
  const risk = item.kind === "issue" ? gatePlanRisk(item.summary) : null;
  const busy = item.kind === "issue" && item.summary.readable && item.summary.busy;
  const since = sinceOf(item);
  return (
    <li className={first ? "dk-rowi dk-two dk-first" : "dk-rowi dk-two"}>
      <div className="dk-grow">
        <div className="dk-row">
          {first && <span className="dk-nextup">{t("desk.board.nextUp")}</span>}
          <RouteLink ref={titleRef} to={routeOf(item)} className="dk-ttl" onFocus={onFocusTitle}>
            <span className="dk-idn">{refOf(t, item)}</span> {titleOf(t, item)}
          </RouteLink>
          {unread && <UnreadMark />}
          {item.kind === "job" && (
            <span className="dk-tag">
              {t("desk.work.jobTag", { kind: t(`desk.work.jobKind.${item.job.kind}`) })}
            </span>
          )}
          {risk === "high" && (
            <StatusChip tone={PLAN_RISK_TONE.high}>{t(PLAN_RISK_KEY.high)}</StatusChip>
          )}
          {item.kind === "issue" &&
            item.summary.readable &&
            item.summary.flowId !== BUILTIN_FLOW_ID && (
              // A row names its flow only when it is not the built-in default.
              <span className="dk-tag">{t("desk.card.flow", { name: item.summary.flowName })}</span>
            )}
        </div>
        <p className="dk-why">{whyOf(t, item, pull)}</p>
        <div className="dk-row dk-rmeta dk-t-small dk-t-subtlest">
          <StatusChip tone={chip.tone}>{chip.text}</StatusChip>
          {waited !== null && since !== null && (
            <time className="dk-num" dateTime={since}>
              <span aria-hidden="true">{waited}</span>
              <span className="dk-sr">{t("desk.card.inStage", { duration: waited })}</span>
            </time>
          )}
        </div>
      </div>
      <div className="dk-acts">
        {risk === "low" && item.kind === "issue" && (
          <Button
            appearance="outline"
            spacing="compact"
            className="dk-btn"
            aria-label={t("desk.board.quickApprove.label", { number: item.summary.issueNumber })}
            title={t("desk.board.quickApprove.help", { seconds: UNDO_WINDOW_MS / 1000 })}
            disabled={approving || busy}
            onClick={onApprove}
          >
            {t("desk.board.quickApprove")}
          </Button>
        )}
        <Button
          appearance={first ? "default" : "outline"}
          spacing="compact"
          className="dk-btn"
          onClick={() => navigate(routeOf(item))}
        >
          {actionOf(t, item)}
        </Button>
      </div>
    </li>
  );
}
