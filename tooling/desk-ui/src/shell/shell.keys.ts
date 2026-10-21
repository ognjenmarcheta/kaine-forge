import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * A set of things that mounted pages add while they are on screen: palette actions, page
 * shortcuts. Each page adds a reader, so the list is always the page's latest render.
 */
export interface Registry<T> {
  readonly add: (read: () => readonly T[]) => () => void;
  /** Everything registered, in mount order: the most specific page comes last. */
  readonly all: () => readonly T[];
}

export function createRegistry<T>(): Registry<T> {
  const readers = new Set<() => readonly T[]>();
  return {
    add: (read) => {
      readers.add(read);
      return () => {
        readers.delete(read);
      };
    },
    all: () => [...readers].flatMap((read) => read())
  };
}

/** Register `items` while the calling component is mounted. */
export function useRegister<T>(registry: Registry<T>, items: readonly T[]): void {
  const latest = useRef(items);
  useLayoutEffect(() => {
    latest.current = items;
  });
  useEffect(() => registry.add(() => latest.current), [registry]);
}

// --- shortcuts ------------------------------------------------------------------------------

/** Keys a page can bind. Letters are lower case; `j`/`k` move between decisions. */
export const PAGE_KEYS = [
  "j",
  "k",
  "a",
  "s",
  "n",
  "c",
  "p",
  "ArrowLeft",
  "ArrowRight",
  "Escape"
] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export interface PageShortcut {
  readonly key: PageKey;
  readonly run: () => void;
  /** Translation key of what it does. With one, the palette footer lists the shortcut. */
  readonly labelKey?: string;
}

/** A shortcut as the palette footer shows it: the keys to press and what they do. */
export interface ShortcutHint {
  readonly keys: readonly string[];
  readonly labelKey: string;
}

export const GLOBAL_SHORTCUTS: readonly ShortcutHint[] = [
  { keys: ["G", "B"], labelKey: "desk.keys.goBoard" },
  { keys: ["G", "H"], labelKey: "desk.keys.goHealth" },
  { keys: ["G", "R"], labelKey: "desk.keys.goRuns" }
];

const shortcuts = createRegistry<PageShortcut>();

/** Bind page keys while the calling page is mounted. A later page wins a key both bind. */
export const useShortcuts = (bindings: readonly PageShortcut[]): void =>
  useRegister(shortcuts, bindings);

/** The global shortcuts, then the page shortcuts that say what they do. */
export function shortcutHints(): readonly ShortcutHint[] {
  const page = shortcuts
    .all()
    .flatMap((shortcut) =>
      shortcut.labelKey === undefined
        ? []
        : [{ keys: [keyLabel(shortcut.key)], labelKey: shortcut.labelKey }]
    );
  return [...GLOBAL_SHORTCUTS, ...page];
}

const ARROWS: Readonly<Record<string, string>> = { ArrowLeft: "←", ArrowRight: "→" };

const keyLabel = (key: PageKey): string => ARROWS[key] ?? key.toUpperCase();

/** A `G` then one of these keys within this time goes to a page. */
export const SEQUENCE_MS = 1200;

export type GoTarget = "board" | "health" | "stats";

const GO_KEYS: Readonly<Record<string, GoTarget>> = { b: "board", h: "health", r: "stats" };

/** The person types here: a single key is a letter, not a command. */
const isTyping = (target: Element): boolean =>
  target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !==
  null;

/** A dialog or a menu owns its keys: a letter there must not approve the issue behind it. */
const isInOverlay = (target: Element): boolean =>
  target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]') !== null;

export interface KeyActions {
  readonly openPalette: () => void;
  readonly go: (target: GoTarget) => void;
}

/**
 * The page-wide key handler. ⌘K or Ctrl+K opens the palette anywhere. Every other shortcut is
 * a single key, so it is ignored while the person types, inside a dialog or a menu, and with
 * a modifier key down.
 */
export function createKeyHandler(
  actions: KeyActions,
  pageShortcuts: () => readonly PageShortcut[] = shortcuts.all,
  now: () => number = Date.now
): (event: KeyboardEvent) => void {
  let sequenceAt: number | null = null;
  return (event) => {
    if (event.defaultPrevented) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      actions.openPalette();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target !== null && (isTyping(target) || isInOverlay(target))) return;

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const started = sequenceAt;
    sequenceAt = null;
    if (started !== null && now() - started < SEQUENCE_MS) {
      const view = GO_KEYS[key];
      if (view !== undefined) {
        event.preventDefault();
        actions.go(view);
        return;
      }
    }
    if (key === "g") {
      sequenceAt = now();
      return;
    }
    if (key === "/") {
      event.preventDefault();
      actions.openPalette();
      return;
    }
    const bound = pageShortcuts().filter((shortcut) => shortcut.key === key);
    const last = bound[bound.length - 1];
    if (last === undefined) return;
    event.preventDefault();
    last.run();
  };
}

/** Listen for the shortcuts on the whole document while the shell is mounted. */
export function useGlobalKeys(actions: KeyActions): void {
  const latest = useRef(actions);
  useLayoutEffect(() => {
    latest.current = actions;
  });
  const [handler] = useState(() =>
    createKeyHandler({
      openPalette: () => latest.current.openPalette(),
      go: (target) => latest.current.go(target)
    })
  );
  useEffect(() => {
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handler]);
}
