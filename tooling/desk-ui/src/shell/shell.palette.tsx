import type { IssueSummary } from "@repo/desk/contracts";
import { Button, Input, Modal } from "@repo/ui";
import { Fragment, useEffect, useId, useState, type KeyboardEvent } from "react";

import { createRegistry, shortcutHints, useRegister } from "./shell.keys";
import { useRouter } from "./shell.router";
import { useT, type Translate } from "../i18n/i18n.t";
import { useDesk } from "../state/desk.provider";
import { statusLabelText } from "../status/status.chip";
import { isYourTurn, issueStatusOf } from "../status/status.model";

/** One row of the palette. */
export interface PaletteCommand {
  /** Stable and unique in the palette. */
  readonly id: string;
  readonly label: string;
  /** Quiet context on the right, such as the status of an issue. */
  readonly detail?: string;
  /** The key that does the same outside the palette ("A", "G B"). */
  readonly hint?: string;
  readonly run: () => void;
}

const SECTIONS = ["here", "recent", "turn", "goto", "issues"] as const;
type Section = (typeof SECTIONS)[number];

interface Entry {
  readonly section: Section;
  readonly command: PaletteCommand;
}

const pageActions = createRegistry<PaletteCommand>();

/** Offer page actions under "Actions here" while the calling page is mounted. */
export const usePaletteActions = (actions: readonly PaletteCommand[]): void =>
  useRegister(pageActions, actions);

// --- recent issues --------------------------------------------------------------------------

const RECENT_KEY = "kaine-desk-recent";
const RECENT_KEPT = 8;
const RECENT_SHOWN = 4;

/** Storage can throw (private windows, blocked site data). Recent issues are a convenience. */
export function readRecent(): number[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((value): value is number => Number.isInteger(value) && value > 0)
      : [];
  } catch {
    return [];
  }
}

export function rememberIssue(issueNumber: number): void {
  const next = [issueNumber, ...readRecent().filter((n) => n !== issueNumber)].slice(
    0,
    RECENT_KEPT
  );
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // The palette shows no recent issues then.
  }
}

// --- ranking --------------------------------------------------------------------------------

/** A search as the palette reads it: trimmed, lower case, without a leading `#`. */
export const normalizeQuery = (query: string): string =>
  query.trim().toLocaleLowerCase().replace(/^#/, "");

/**
 * How well `label` matches `query` (already normalized). A substring scores 100 minus its
 * position; the query's letters in order, with gaps, score 1 to 40 (fewer gaps score more);
 * no match is -1.
 */
export function fuzzyScore(label: string, query: string): number {
  const text = label.toLocaleLowerCase();
  const at = text.indexOf(query);
  if (at >= 0) return 100 - at;
  let matched = 0;
  let gaps = 0;
  let last = -1;
  for (let index = 0; index < text.length && matched < query.length; index += 1) {
    if (text[index] !== query[matched]) continue;
    if (last >= 0) gaps += index - last - 1;
    last = index;
    matched += 1;
  }
  return matched === query.length ? Math.max(1, 40 - gaps) : -1;
}

export const PALETTE_LIMIT = 12;

/** The best matches first, at most `PALETTE_LIMIT`, each label once. */
export function rankEntries<T extends { readonly command: PaletteCommand }>(
  entries: readonly T[],
  query: string
): T[] {
  const seen = new Set<string>();
  return entries
    .map((entry) => ({ entry, score: fuzzyScore(entry.command.label, query) }))
    .filter(({ entry, score }) => {
      if (score < 0 || seen.has(entry.command.label)) return false;
      seen.add(entry.command.label);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, PALETTE_LIMIT)
    .map(({ entry }) => entry);
}

// --- the palette ----------------------------------------------------------------------------

const issueLabel = (t: Translate, summary: IssueSummary): string =>
  t("desk.issue.numbered", {
    number: summary.issueNumber,
    title: summary.readable ? (summary.title ?? t("desk.issue.untitled")) : ""
  }).trim();

const issueDetail = (t: Translate, summary: IssueSummary): string =>
  statusLabelText(t, issueStatusOf(summary).label);

function useEntries(): Entry[] {
  const t = useT();
  const { state } = useDesk();
  const { route, navigate } = useRouter();
  const current = route.view === "issue" ? route.issueNumber : null;
  const issues = Object.values(state.issues);
  const open = (summary: IssueSummary): PaletteCommand => ({
    id: `issue-${String(summary.issueNumber)}`,
    label: issueLabel(t, summary),
    detail: issueDetail(t, summary),
    run: () => navigate({ view: "issue", issueNumber: summary.issueNumber })
  });
  const go = (id: "board" | "health" | "stats", key: string, hint: string): PaletteCommand => ({
    id: `go-${id}`,
    label: t(key),
    hint,
    run: () => navigate({ view: id })
  });
  const entries = (section: Section, commands: readonly PaletteCommand[]): Entry[] =>
    commands.map((command) => ({ section, command }));

  return [
    ...entries("here", pageActions.all()),
    ...entries(
      "recent",
      readRecent()
        .flatMap((n) => {
          const summary = state.issues[n];
          return summary === undefined ? [] : [summary];
        })
        .slice(0, RECENT_SHOWN)
        .map(open)
    ),
    ...entries(
      "turn",
      issues
        .filter((s) => s.issueNumber !== current && isYourTurn(issueStatusOf(s).group))
        .map(open)
    ),
    ...entries("goto", [
      go("board", "desk.nav.board", "G B"),
      go("health", "desk.nav.health", "G H"),
      go("stats", "desk.nav.stats", "G R")
    ]),
    ...entries("issues", issues.map(open))
  ];
}

/** Without a search: the sections in order, without the full issue list. */
const browseEntries = (entries: readonly Entry[]): Entry[] =>
  SECTIONS.filter((section) => section !== "issues").flatMap((section) =>
    entries.filter((entry) => entry.section === section)
  );

function Kbd({ children }: { readonly children: string }) {
  return <kbd className="desk-kbd">{children}</kbd>;
}

function PaletteBody({ onClose }: { readonly onClose: () => void }) {
  const t = useT();
  const id = useId();
  const all = useEntries();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const normalized = normalizeQuery(query);
  const searching = normalized !== "";
  const shown = searching ? rankEntries(all, normalized) : browseEntries(all);
  const active = shown.length === 0 ? -1 : Math.min(selected, shown.length - 1);
  const optionId = (index: number): string => `${id}-option-${String(index)}`;

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  });

  const run = (entry: Entry | undefined): void => {
    if (entry === undefined) return;
    onClose();
    entry.command.run();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (shown.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setSelected((active + step + shown.length) % shown.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(shown[active]);
    }
  };

  const groups = searching
    ? [{ section: null, rows: shown.map((entry, index) => ({ entry, index })) }]
    : SECTIONS.flatMap((section) => {
        const rows = shown
          .map((entry, index) => ({ entry, index }))
          .filter(({ entry }) => entry.section === section);
        return rows.length === 0 ? [] : [{ section, rows }];
      });
  const listId = `${id}-list`;

  return (
    <div className="desk-palette">
      <Input
        className="desk-palette__input"
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active < 0 ? undefined : optionId(active)}
        aria-label={t("desk.palette.search")}
        placeholder={t("desk.palette.placeholder")}
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(0);
        }}
        onKeyDown={onKeyDown}
      />
      <div
        id={listId}
        role="listbox"
        aria-label={t("desk.palette.results")}
        className="desk-palette__list"
      >
        {groups.map(({ section, rows }) => (
          <Fragment key={section ?? "results"}>
            {section !== null && (
              <div className="desk-palette__head" role="presentation">
                {t(`desk.palette.section.${section}`)}
              </div>
            )}
            {rows.map(({ entry, index }) => (
              <Button
                key={`${entry.section}-${entry.command.id}`}
                appearance="ghost"
                id={optionId(index)}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={index === active}
                className="desk-palette__option"
                onMouseMove={() => {
                  if (index !== active) setSelected(index);
                }}
                onClick={() => run(entry)}
              >
                <span className="desk-palette__label">{entry.command.label}</span>
                <span className="desk-palette__detail">
                  {searching ? t(`desk.palette.section.${entry.section}`) : entry.command.detail}
                </span>
                {entry.command.hint !== undefined && <Kbd>{entry.command.hint}</Kbd>}
              </Button>
            ))}
          </Fragment>
        ))}
      </div>
      {shown.length === 0 && <p className="desk-palette__empty">{t("desk.palette.empty")}</p>}
      <div className="desk-palette__foot">
        <span>
          <Kbd>{t("desk.keys.up")}</Kbd>
          <Kbd>{t("desk.keys.down")}</Kbd> {t("desk.palette.move")}
        </span>
        <span>
          <Kbd>{t("desk.keys.enter")}</Kbd> {t("desk.palette.run")}
        </span>
        <span>
          <Kbd>{t("desk.keys.esc")}</Kbd> {t("desk.common.close")}
        </span>
        <span className="desk-palette__spacer" />
        {shortcutHints().map((hint) => (
          <span key={hint.keys.join(" ")}>
            {hint.keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}{" "}
            {t(hint.labelKey)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Search or jump: page actions, recent issues, the issues that wait on you, and the pages.
 * Typing ranks everything, the full issue list too. ↑/↓ move, Enter runs, Esc closes.
 */
export function CommandPalette({
  open,
  onOpenChange
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("desk.palette.title")}
      showCloseButton={false}
      hideFooter
    >
      {open && <PaletteBody onClose={() => onOpenChange(false)} />}
    </Modal>
  );
}
