import type { IssueSummary } from "@repo/desk/contracts";
import { Button, Input, Plus, Search, X } from "@repo/ui";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { IssueCard } from "./board.card";
import { groupIssues, matchesSearch } from "./board.grouping";
import { StartDialog } from "./board.start-dialog";
import { useT } from "../i18n/i18n.t";
import { useNow } from "../shell/shell.now";
import { toastSettled } from "../shell/shell.toast";
import { Loading } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { BOARD_GROUPS, type BoardGroup } from "../status/status.model";

/** Cards shown in the finished column before the engineer asks for more. */
export const DONE_LIMIT = 12;
/** The board filters once typing pauses this long. */
const SEARCH_DELAY_MS = 150;

/** A field the `/` shortcut must leave alone: the engineer types there. */
const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

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

export function BoardView() {
  const t = useT();
  const { state } = useDesk();
  const now = useNow();
  const [startOpen, setStartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const search = useDeferredValue(useDebounced(query, SEARCH_DELAY_MS));
  const searchBox = useRef<HTMLInputElement>(null);
  useRefusedStartToasts();

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      searchBox.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const all = useMemo(() => Object.values(state.issues), [state.issues]);
  const groups = useMemo(
    () => groupIssues(all.filter((summary) => matchesSearch(summary, search))),
    [all, search]
  );

  return (
    <div className="desk-board-page">
      <div className="desk-heading">
        <div>
          <h1>{t("desk.board.title")}</h1>
          <p className="desk-muted">{t("desk.board.intro")}</p>
        </div>
      </div>
      <div className="desk-toolbar">
        <div className="desk-search">
          <Search aria-hidden="true" className="desk-icon desk-search__icon" />
          <Input
            ref={searchBox}
            type="search"
            className="desk-search__input"
            aria-label={t("desk.board.search")}
            aria-keyshortcuts="/"
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
        <Button className="desk-toolbar__start" onClick={() => setStartOpen(true)}>
          <Plus aria-hidden="true" className="desk-icon" />
          {t("desk.start.open")}
        </Button>
      </div>
      {!state.issuesLoaded ? (
        <Loading />
      ) : all.length === 0 ? (
        <div className="desk-empty">
          <h2>{t("desk.board.emptyTitle")}</h2>
          <p>{t("desk.board.empty")}</p>
          <Button onClick={() => setStartOpen(true)}>{t("desk.start.open")}</Button>
        </div>
      ) : (
        <div className="desk-board">
          {BOARD_GROUPS.map((group) => (
            <Column
              key={group}
              group={group}
              issues={groups[group]}
              searching={search.trim() !== ""}
              now={now}
            />
          ))}
        </div>
      )}
      <StartDialog open={startOpen} onOpenChange={setStartOpen} />
    </div>
  );
}
