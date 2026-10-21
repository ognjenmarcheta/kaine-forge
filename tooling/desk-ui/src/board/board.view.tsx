import type { IssueSummary } from "@repo/desk/contracts";
import { Button, Card, Input, Plus, Search, X, useMediaQuery } from "@repo/ui";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";

import { useApprovePlans } from "./board.actions";
import { IssueCard } from "./board.card";
import { FilterChips, useIssueCosts } from "./board.filters";
import {
  groupIssues,
  matchesFilter,
  matchesSearch,
  yourTurn,
  type BoardFilter
} from "./board.grouping";
import { OpenPullRequests, SidePullRequests } from "./board.pulls";
import { DoneList, RunningList } from "./board.side";
import { StartDialog } from "./board.start-dialog";
import { TurnInbox } from "./board.turn";
import { ApproveBatchDialog } from "../gates/gate.confirm";
import { useT } from "../i18n/i18n.t";
import { Segmented } from "../shell/shell.layout";
import { useNow } from "../shell/shell.now";
import { usePaletteActions } from "../shell/shell.palette";
import { BOARD_LAYOUTS, useBoardLayout, type BoardLayout } from "../shell/shell.preferences";
import { RouteLink } from "../shell/shell.router";
import { toastSettled } from "../shell/shell.toast";
import { Loading } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { BOARD_GROUPS, isLowRiskPlan, type BoardGroup } from "../status/status.model";

/** Cards shown in the finished column before the engineer asks for more. */
export const DONE_LIMIT = 12;
/** The board filters once typing pauses this long. */
const SEARCH_DELAY_MS = 150;
/** A phone: Your turn only, and the next decision in a bar at the bottom. */
const PHONE_QUERY = "(max-width: 40rem)";

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (value === "") {
      setDebounced("");
      return;
    }
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * A start that the engine refused after it answered `accepted` never puts a card on the board.
 * Its `action-result` arrives later, and this shows it as a toast, once.
 */
function useRefusedStartToasts(): void {
  const t = useT();
  const { state } = useDesk();
  // Results that arrived before this board mounted were reported then; do not repeat them.
  const [seen] = useState(() => new Set(Object.values(state.notes).map((note) => note.seq)));
  useEffect(() => {
    for (const [key, note] of Object.entries(state.notes)) {
      const issueNumber = Number(key);
      if (note.action !== "start" || note.error === null || seen.has(note.seq)) continue;
      if (state.issues[issueNumber] !== undefined) continue;
      seen.add(note.seq);
      toastSettled(t, issueNumber, "start", {
        kind: "error",
        code: note.error.code,
        detail: note.error.detail
      });
    }
  }, [seen, state.notes, state.issues, t]);
}

function Column({
  group,
  issues,
  searching,
  now
}: {
  readonly group: BoardGroup;
  readonly issues: readonly IssueSummary[];
  readonly searching: boolean;
  readonly now: number;
}) {
  const t = useT();
  const [showAll, setShowAll] = useState(false);
  const limited = group === "done" && !showAll && issues.length > DONE_LIMIT;
  const shown = limited ? issues.slice(0, DONE_LIMIT) : issues;
  return (
    <section aria-labelledby={`board-${group}`} className="desk-column" data-group={group}>
      <header className="desk-column__head">
        <h2 id={`board-${group}`}>
          {t(`desk.board.group.${group}`)}{" "}
          <span className="desk-count" data-empty={issues.length === 0 ? "true" : undefined}>
            {issues.length}
          </span>
        </h2>
        <p className="desk-muted">{t(`desk.board.groupHelp.${group}`)}</p>
      </header>
      <div className="desk-column__body">
        {issues.length === 0 ? (
          <p className="desk-column__empty">
            {searching ? t("desk.board.noMatch") : t(`desk.board.columnEmpty.${group}`)}
          </p>
        ) : (
          <ul className="desk-cards">
            {shown.map((summary) => (
              <li key={summary.issueNumber}>
                <IssueCard summary={summary} now={now} />
              </li>
            ))}
          </ul>
        )}
        {limited && (
          <Button appearance="subtle" onClick={() => setShowAll(true)}>
            {t("desk.board.showAll", { count: issues.length })}
          </Button>
        )}
      </div>
    </section>
  );
}

/**
 * A failed health check makes the next start or continue fail. Say so on the board, once,
 * with the way to Health. The report comes from the store; the board asks for it once when
 * no page has yet.
 */
function HealthBanner() {
  const t = useT();
  const { state, loadHealth } = useDesk();
  const [dismissed, setDismissed] = useState(false);
  const missing = state.health === null;
  useEffect(() => {
    if (missing) loadHealth().catch(() => undefined);
  }, [missing, loadHealth]);
  const failures = state.health?.checks.filter((check) => check.status === "error") ?? [];
  const [first] = failures;
  if (dismissed || first === undefined) return null;
  return (
    <div className="desk-banner" role="alert">
      <strong>
        {failures.length === 1
          ? t("desk.board.health.title", { label: first.label })
          : t("desk.board.health.titleMore", { label: first.label, count: failures.length - 1 })}
      </strong>
      <span>{t("desk.board.health.body")}</span>
      <RouteLink to={{ view: "health" }}>{t("desk.board.health.open")}</RouteLink>
      <span className="desk-banner__spacer" />
      <Button appearance="link" spacing="compact" onClick={() => setDismissed(true)}>
        {t("desk.board.health.dismiss")}
      </Button>
    </div>
  );
}

/** No issue on the desk yet: three steps, and the way to start the first one. */
function Onboarding({ onStart }: { readonly onStart: () => void }) {
  const t = useT();
  const heading = useId();
  return (
    <Card className="desk-onboard" aria-labelledby={heading} role="region">
      <h2 id={heading}>{t("desk.board.emptyTitle")}</h2>
      <p className="desk-muted">{t("desk.board.empty")}</p>
      <ol className="desk-onboard__steps">
        <li>
          <b>{t("desk.board.onboard.setup")}</b>{" "}
          <span className="desk-muted">{t("desk.board.onboard.setupHelp")}</span>{" "}
          <RouteLink to={{ view: "health" }}>{t("desk.board.health.open")}</RouteLink>
        </li>
        <li>
          <b>{t("desk.board.onboard.pick")}</b>{" "}
          <span className="desk-muted">{t("desk.board.onboard.pickHelp")}</span>
        </li>
        <li>
          <b>{t("desk.board.onboard.approve")}</b>{" "}
          <span className="desk-muted">{t("desk.board.onboard.approveHelp")}</span>
        </li>
      </ol>
      <div>
        <Button onClick={onStart}>{t("desk.board.onboard.start")}</Button>
      </div>
    </Card>
  );
}

export function BoardView() {
  const t = useT();
  const { state } = useDesk();
  const now = useNow();
  const phone = useMediaQuery(PHONE_QUERY);
  const [storedLayout, setLayout] = useBoardLayout();
  const layout = phone ? "turn" : storedLayout;
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [startOpen, setStartOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const search = useDeferredValue(useDebounced(query, SEARCH_DELAY_MS));
  const searchBox = useRef<HTMLInputElement>(null);
  const approvals = useApprovePlans();
  const costs = useIssueCosts(layout === "columns");
  useRefusedStartToasts();

  const all = useMemo(() => Object.values(state.issues), [state.issues]);
  const found = useMemo(
    () => all.filter((summary) => matchesSearch(summary, search)),
    [all, search]
  );
  const groups = useMemo(
    () =>
      groupIssues(
        layout === "columns"
          ? found.filter((summary) => matchesFilter(summary, filter, costs))
          : found
      ),
    [found, layout, filter, costs]
  );
  const everyGroup = useMemo(() => groupIssues(all), [all]);
  const turn = useMemo(() => yourTurn(groups), [groups]);
  // The batch covers every low-risk plan at its gate, whatever the search shows.
  const batch = useMemo(
    () =>
      yourTurn(everyGroup).decisions.filter(
        (summary) => isLowRiskPlan(summary) && !approvals.pending.has(summary.issueNumber)
      ),
    [everyGroup, approvals.pending]
  );

  const chooseLayout = (next: BoardLayout): void => {
    setLayout(next);
    setFilter("all");
  };
  const otherLayout: BoardLayout = layout === "turn" ? "columns" : "turn";
  usePaletteActions([
    { id: "board-start", label: t("desk.start.open"), run: () => setStartOpen(true) },
    ...(phone
      ? []
      : [
          {
            id: "board-layout",
            label: t(`desk.board.layout.switch.${otherLayout}`),
            run: () => chooseLayout(otherLayout)
          }
        ]),
    ...(batch.length > 1
      ? [
          {
            id: "board-batch",
            label: t("desk.board.batch.open", { count: batch.length }),
            run: () => setBatchOpen(true)
          }
        ]
      : [])
  ]);

  const turnCount = everyGroup["needs-you"].length + everyGroup.waiting.length;
  const searching = search.trim() !== "";

  return (
    <div className="desk-board-page" data-layout={layout}>
      <HealthBanner />
      <div className="desk-board-head">
        <div className="desk-board-head__text">
          <h1>
            {layout === "turn"
              ? t("desk.board.turn.title", { count: turnCount })
              : t("desk.board.title")}
          </h1>
          <p className="desk-muted">
            {layout === "turn"
              ? t("desk.board.turn.intro", {
                  needs: everyGroup["needs-you"].length,
                  decisions: everyGroup.waiting.length,
                  running: everyGroup.running.length
                })
              : t("desk.board.intro")}
          </p>
        </div>
        <div className="desk-board-head__layout">
          <Segmented
            label={t("desk.board.layout.label")}
            value={layout}
            options={BOARD_LAYOUTS}
            name={(option) => t(`desk.board.layout.${option}`)}
            onChange={chooseLayout}
          />
        </div>
        <Button className="desk-toolbar__start" onClick={() => setStartOpen(true)}>
          <Plus aria-hidden="true" className="desk-icon" />
          {t("desk.start.open")}
        </Button>
      </div>
      {!state.issuesLoaded ? (
        <Loading />
      ) : all.length === 0 ? (
        <Onboarding onStart={() => setStartOpen(true)} />
      ) : (
        <>
          <div className="desk-toolbar">
            <div className="desk-search" role="search">
              <Search aria-hidden="true" className="desk-icon desk-search__icon" />
              <Input
                ref={searchBox}
                type="search"
                className="desk-search__input"
                aria-label={t("desk.board.search")}
                placeholder={t("desk.board.searchPlaceholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && query !== "") {
                    event.preventDefault();
                    setQuery("");
                  }
                }}
              />
              {query !== "" && (
                <Button
                  appearance="ghost"
                  spacing="compact"
                  className="desk-search__clear"
                  aria-label={t("desk.board.searchClear")}
                  onClick={() => {
                    setQuery("");
                    searchBox.current?.focus();
                  }}
                >
                  <X aria-hidden="true" className="desk-icon" />
                </Button>
              )}
            </div>
            {layout === "columns" && (
              <FilterChips issues={found} costs={costs} value={filter} onChange={setFilter} />
            )}
          </div>
          {layout === "turn" ? (
            <div className="desk-inbox">
              <TurnInbox
                needsYou={turn.needsYou}
                decisions={turn.decisions}
                batchCount={batch.length}
                onAskBatch={() => setBatchOpen(true)}
                approvals={approvals}
                searching={searching}
                now={now}
              />
              <aside className="desk-side" aria-label={t("desk.board.side.label")}>
                <RunningList issues={groups.running} now={now} />
                <SidePullRequests />
                <DoneList issues={groups.done} />
              </aside>
            </div>
          ) : (
            <>
              <div className="desk-board">
                {BOARD_GROUPS.map((group) => (
                  <Column
                    key={group}
                    group={group}
                    issues={groups[group]}
                    searching={searching || filter !== "all"}
                    now={now}
                  />
                ))}
              </div>
              <OpenPullRequests />
            </>
          )}
        </>
      )}
      <StartDialog open={startOpen} onOpenChange={setStartOpen} />
      <ApproveBatchDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        plans={batch.map((summary) => ({
          issueNumber: summary.issueNumber,
          title: summary.readable ? (summary.title ?? t("desk.issue.untitled")) : ""
        }))}
        onConfirm={() => approvals.approve(batch.map((summary) => summary.issueNumber))}
      />
    </div>
  );
}
