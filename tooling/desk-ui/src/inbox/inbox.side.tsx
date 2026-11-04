import { Button } from "@repo/ui";
import { useId, useState, type ReactNode } from "react";

import { UnreadMark, useWaited } from "./inbox.row";
import { useLanguage, useT } from "../i18n/i18n.t";
import { relativeTime } from "../shell/shell.format";
import { RouteLink } from "../shell/shell.router";
import { useDesk } from "../state/desk.provider";
import { StatusChip } from "../status/status.chip";
import { updatedOf, type WorkItem } from "../work/work.model";
import { chipOf, refOf, routeOf, titleOf } from "../work/work.present";

/** Running items shown before "Show all". */
export const RUNNING_SHOWN = 4;
/** Finished items the panel shows: the newest few. All work has the rest. */
export const FINISHED_SHOWN = 4;

function Panel({
  title,
  count,
  children
}: {
  readonly title: string;
  readonly count?: number;
  readonly children: ReactNode;
}) {
  const heading = useId();
  return (
    <section className="dk-card" aria-labelledby={heading}>
      <div className="dk-row dk-mb-100">
        <h2 id={heading} className="dk-h-sec">
          {title}
        </h2>
        {count !== undefined && <span className="dk-count dk-num">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function ItemLink({ item }: { readonly item: WorkItem }) {
  const t = useT();
  return (
    <RouteLink to={routeOf(item)} className="dk-t">
      <span className="dk-idn">{refOf(t, item)}</span> {titleOf(t, item)}
    </RouteLink>
  );
}

function RunningItem({
  item,
  unread,
  now
}: {
  readonly item: WorkItem;
  readonly unread: boolean;
  readonly now: number;
}) {
  const t = useT();
  const { state } = useDesk();
  const waited = useWaited(item, now);
  const paused = item.kind === "issue" && item.summary.readable && item.summary.paused;
  // The last line the engine or the agent wrote: what runs now.
  const latest =
    item.kind === "issue" ? state.logs[item.summary.issueNumber]?.at(-1)?.text : undefined;
  return (
    <li className="dk-lite">
      <span className="dk-row">
        <ItemLink item={item} />
        {unread && <UnreadMark />}
      </span>
      <span className="dk-row dk-t-small dk-t-sub">
        {!paused && <span className="dk-spin" aria-hidden="true" />}
        <span>{chipOf(t, item).text}</span>
        {waited !== null && <span className="dk-t-subtlest dk-dot">{waited}</span>}
      </span>
      {latest !== undefined && <span className="dk-t-xs dk-t-subtlest dk-mono">{latest}</span>}
    </li>
  );
}

/** What runs now: the top few, the rest on request. A paused item says so. */
export function RunningPanel({
  items,
  unread,
  now
}: {
  readonly items: readonly WorkItem[];
  readonly unread: (item: WorkItem) => boolean;
  readonly now: number;
}) {
  const t = useT();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, RUNNING_SHOWN);
  return (
    <Panel title={t("desk.inbox.group.running")} count={items.length}>
      {items.length === 0 ? (
        <p className="dk-t-sub dk-t-small">{t("desk.inbox.runningNone")}</p>
      ) : (
        <ul>
          {shown.map((item) => (
            <RunningItem key={item.key} item={item} unread={unread(item)} now={now} />
          ))}
        </ul>
      )}
      {items.length > RUNNING_SHOWN && (
        <Button
          type="button"
          appearance="link"
          spacing="compact"
          className="dk-bare dk-linkbtn dk-t-small"
          onClick={() => setAll((was) => !was)}
        >
          {all ? t("desk.board.showFewer") : t("desk.board.showAll", { count: items.length })}
        </Button>
      )}
    </Panel>
  );
}

/** The newest few that ended: shipped, cancelled, or finished, with the PR and when. */
export function FinishedPanel({
  items,
  now
}: {
  readonly items: readonly WorkItem[];
  readonly now: number;
}) {
  const t = useT();
  const { language } = useLanguage();
  return (
    <Panel title={t("desk.inbox.group.finished")}>
      {items.length === 0 ? (
        <p className="dk-t-sub dk-t-small">{t("desk.board.side.doneNone")}</p>
      ) : (
        <ul>
          {items.slice(0, FINISHED_SHOWN).map((item) => {
            const chip = chipOf(t, item);
            const pr = item.kind === "issue" && item.summary.readable ? item.summary.prUrl : null;
            const number = pr === null ? null : /\/pull\/(\d+)/.exec(pr)?.[1];
            return (
              <li key={item.key} className="dk-lite">
                <ItemLink item={item} />
                <span className="dk-row dk-t-small dk-t-sub">
                  <StatusChip tone={chip.tone}>{chip.text}</StatusChip>
                  {number !== undefined && number !== null && (
                    <span>{t("desk.inbox.pr", { number })}</span>
                  )}
                  <span className="dk-t-subtlest">
                    {relativeTime(updatedOf(item), now, language)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > FINISHED_SHOWN && (
        <RouteLink to={{ view: "work" }} className="dk-linkbtn dk-t-small">
          {t("desk.inbox.allFinished", { count: items.length })}
        </RouteLink>
      )}
    </Panel>
  );
}
