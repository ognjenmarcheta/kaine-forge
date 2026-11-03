import { Button, Input } from "@repo/ui";
import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";

import { byNewest, type WorkItem } from "./work.model";
import { chipOf, refOf, routeOf, titleOf, whyOf } from "./work.present";
import { useLanguage, useT } from "../i18n/i18n.t";
import { UnreadMark } from "../inbox/inbox.row";
import { useUnread } from "../inbox/inbox.unread";
import { stepStates } from "../jobs/job.model";
import { formatUsd, relativeTime } from "../shell/shell.format";
import { useNewWork } from "../shell/shell.newwork";
import { useWorkItems } from "../shell/shell.notify";
import { useNow } from "../shell/shell.now";
import { WORK_VIEWS, useWorkView } from "../shell/shell.preferences";
import { RouteLink } from "../shell/shell.router";
import { Segmented } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { StatusChip } from "../status/status.chip";
import type { InboxGroup } from "../status/status.model";

/** The filters of All work. Each counts the work that matches the search. */
export const WORK_FILTERS = [
  "all",
  "stopped",
  "decide",
  "github",
  "running",
  "finished",
  "jobs"
] as const;
export type WorkFilter = (typeof WORK_FILTERS)[number];

/** The columns: a PR on GitHub waits on the owner too, so it sits with the decisions. */
const COLUMNS = ["stopped", "decide", "running", "finished"] as const;
const columnOf = (group: InboxGroup): (typeof COLUMNS)[number] =>
  group === "github" ? "decide" : group;

export const matchesWorkFilter = (item: WorkItem, filter: WorkFilter): boolean =>
  filter === "all" || (filter === "jobs" ? item.kind === "job" : item.group === filter);

/**
 * Does the item match the search? A number (with or without `#`) matches the start of an issue
 * number; any other text matches the title, ignoring case. An empty search matches all.
 */
export function matchesSearch(t: (key: string) => string, item: WorkItem, search: string): boolean {
  const query = search.trim().toLocaleLowerCase();
  if (query === "") return true;
  const number = /^#?(\d+)$/.exec(query)?.[1];
  if (number !== undefined) {
    return item.kind === "issue" && String(item.summary.issueNumber).startsWith(number);
  }
  return titleOf(t, item).toLocaleLowerCase().includes(query);
}

/** Steps done of all steps: an issue's flow nodes, or a job's own steps. */
function progressOf(item: WorkItem): { readonly done: number; readonly total: number } {
  if (item.kind === "job") {
    const states = stepStates(item.job);
    return { done: states.filter((state) => state === "done").length, total: states.length };
  }
  if (!item.summary.readable) return { done: 0, total: 0 };
  const { progress } = item.summary;
  return {
    done: progress.filter((status) => status === "passed" || status === "looped").length,
    total: progress.length
  };
}

/** The total run cost of each issue, from the run stats. Empty until they load. */
function useIssueCosts(): ReadonlyMap<number, number> {
  const { api, state } = useDesk();
  const [costs, setCosts] = useState<ReadonlyMap<number, number>>(() => new Map());
  useEffect(() => {
    let current = true;
    api
      .stats()
      .then((stats) => {
        if (!current) return;
        setCosts(
          new Map(
            stats.issues.flatMap((rollup) =>
              rollup.totalCostUsd === null ? [] : [[rollup.issue, rollup.totalCostUsd] as const]
            )
          )
        );
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
    // A finished run changes its issue, so a changed issue list can mean new costs.
  }, [api, state.issues]);
  return costs;
}

function WorkTitle({ item }: { readonly item: WorkItem }) {
  const t = useT();
  return (
    <RouteLink to={routeOf(item)} className="dk-work-t">
      <span className="dk-idn">{refOf(t, item)}</span> {titleOf(t, item)}
    </RouteLink>
  );
}

function WorkTable({
  items,
  unread
}: {
  readonly items: readonly WorkItem[];
  readonly unread: (item: WorkItem) => boolean;
}) {
  const t = useT();
  const { language } = useLanguage();
  const now = useNow();
  const costs = useIssueCosts();
  return (
    <div className="dk-tbl-wrap">
      <table className="dk-tbl">
        <thead>
          <tr>
            <th scope="col">{t("desk.work.col.work")}</th>
            <th scope="col">{t("desk.work.col.status")}</th>
            <th scope="col" className="dk-hide-phone">
              {t("desk.work.col.flow")}
            </th>
            <th scope="col" className="dk-hide-phone">
              {t("desk.work.col.steps")}
            </th>
            <th scope="col" className="dk-n dk-hide-phone">
              {t("desk.work.col.cost")}
            </th>
            <th scope="col" className="dk-n">
              {t("desk.work.col.updated")}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const chip = chipOf(t, item);
            const progress = progressOf(item);
            const cost =
              item.kind === "job"
                ? item.job.spentUsd
                : (costs.get(item.summary.issueNumber) ?? null);
            const flow =
              item.kind === "job"
                ? t(`desk.work.jobKind.${item.job.kind}`)
                : item.summary.readable
                  ? item.summary.flowName
                  : "–";
            const updated =
              item.kind === "job"
                ? item.job.updatedAt
                : item.summary.readable
                  ? item.summary.updatedAt
                  : null;
            return (
              <tr key={item.key}>
                <td>
                  <WorkTitle item={item} /> {unread(item) && <UnreadMark />}
                </td>
                <td>
                  <StatusChip tone={chip.tone}>{chip.text}</StatusChip>
                </td>
                <td className="dk-hide-phone dk-t-sub">{flow}</td>
                <td className="dk-hide-phone">
                  {progress.total > 0 && (
                    <div className="dk-row">
                      <progress
                        className="dk-meter"
                        max={progress.total}
                        value={progress.done}
                        aria-label={t("desk.work.stepsDone", progress)}
                      />
                      <span className="dk-t-small dk-t-sub dk-num" aria-hidden="true">
                        {t("desk.work.stepsShort", progress)}
                      </span>
                    </div>
                  )}
                </td>
                <td className="dk-n dk-hide-phone">
                  {cost === null ? "–" : formatUsd(cost, language)}
                </td>
                <td className="dk-n dk-t-sub">
                  {updated === null ? "–" : relativeTime(updated, now, language)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WorkColumns({ items }: { readonly items: readonly WorkItem[] }) {
  const t = useT();
  return (
    <div className="dk-kanban">
      {COLUMNS.map((column) => {
        const cards = items.filter((item) => columnOf(item.group) === column);
        return (
          <section key={column} className="dk-kcol" aria-label={t(`desk.inbox.group.${column}`)}>
            <div className="dk-row">
              <h2 className="dk-h-sec">{t(`desk.inbox.group.${column}`)}</h2>
              <span className="dk-count dk-num">{cards.length}</span>
            </div>
            {cards.map((item) => {
              const chip = chipOf(t, item);
              return (
                <article key={item.key} className="dk-kcard">
                  <WorkTitle item={item} />
                  <span>
                    <StatusChip tone={chip.tone}>{chip.text}</StatusChip>
                  </span>
                  <p className="dk-t-small dk-t-sub">{whyOf(t, item)}</p>
                </article>
              );
            })}
            {cards.length === 0 && (
              <p className="dk-t-small dk-t-subtlest">{t("desk.work.columnEmpty")}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** All work: every issue and desk job, newest first. Open PRs are the "On GitHub" filter. */
export function WorkView() {
  const t = useT();
  const id = useId();
  const newWork = useNewWork();
  const all = useWorkItems();
  const unread = useUnread(all);
  const [view, setView] = useWorkView();
  const [filter, setFilter] = useState<WorkFilter>("all");
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query);

  const found = useMemo(
    () => all.filter((item) => matchesSearch(t, item, search)).sort(byNewest),
    [all, search, t]
  );
  const shown = found.filter((item) => matchesWorkFilter(item, filter));
  const chips = WORK_FILTERS.map((name) => ({
    name,
    count: found.filter((item) => matchesWorkFilter(item, name)).length
  })).filter((chip, index) => index === 0 || chip.count > 0 || chip.name === filter);

  return (
    <>
      <header className="dk-ph">
        <div className="dk-grow">
          <h1 className="dk-h-page">{t("desk.nav.work")}</h1>
          <p className="dk-lead">{t("desk.work.intro")}</p>
        </div>
        <Segmented
          label={t("desk.work.layout")}
          value={view}
          options={WORK_VIEWS}
          name={(option) => t(`desk.work.view.${option}`)}
          onChange={setView}
        />
        <Button type="button" onClick={() => newWork.open()}>
          {t("desk.newWork.open")}
        </Button>
      </header>
      <div className="dk-filters">
        <div className="dk-field dk-search" role="search">
          <label htmlFor={`${id}-search`} className="dk-sr">
            {t("desk.work.search")}
          </label>
          <Input
            id={`${id}-search`}
            type="search"
            placeholder={t("desk.board.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {view === "list" && (
          <div className="dk-row" role="group" aria-label={t("desk.board.filter.label")}>
            {chips.map((chip) => (
              <Button
                type="button"
                key={chip.name}
                appearance="ghost"
                className="dk-bare dk-fchip"
                aria-pressed={chip.name === filter}
                onClick={() => setFilter(chip.name)}
              >
                {t(`desk.work.filter.${chip.name}`)}{" "}
                <span className="dk-t-subtlest dk-num">{chip.count}</span>
              </Button>
            ))}
          </div>
        )}
      </div>
      {view === "list" ? (
        <section className="dk-card dk-flush">
          <WorkTable items={shown} unread={unread} />
          {shown.length === 0 && (
            <div className="dk-empty">
              <p className="dk-h-sec">{t("desk.work.empty.title")}</p>
              <p>{t("desk.work.empty.body")}</p>
            </div>
          )}
        </section>
      ) : (
        <WorkColumns items={found} />
      )}
    </>
  );
}
