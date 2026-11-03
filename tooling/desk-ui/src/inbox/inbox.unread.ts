import { useCallback, useEffect, useSyncExternalStore } from "react";

import { updatedOf, type WorkItem } from "../work/work.model";

const STORAGE_KEY = "kaine-desk-seen";

/** When the person last opened each item, by item key: an ISO time. */
type Seen = Readonly<Record<string, string>>;

const isSeen = (value: unknown): value is Seen =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === "string");

/** Storage can throw or hold anything (private windows, old versions). The page works without it. */
const read = (): Seen => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    return isSeen(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

let seen: Seen | null = null;
const listeners = new Set<() => void>();

const current = (): Seen => {
  seen ??= read();
  return seen;
};

const write = (next: Seen): void => {
  seen = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The marks still apply to this page.
  }
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Unread: the item changed after the person last opened it. An item the desk shows for the
 * first time takes its current change as seen, so a first visit does not mark everything new.
 */
export const isUnread = (item: WorkItem, marks: Seen): boolean => {
  const opened = marks[item.key];
  return opened !== undefined && updatedOf(item) > opened;
};

/** The unread marks, and a baseline for items the desk shows for the first time. */
export function useUnread(items: readonly WorkItem[]): (item: WorkItem) => boolean {
  const marks = useSyncExternalStore(subscribe, current, current);
  useEffect(() => {
    const missing = items.filter((item) => marks[item.key] === undefined);
    if (missing.length === 0) return;
    write({
      ...marks,
      ...Object.fromEntries(missing.map((item) => [item.key, updatedOf(item)]))
    });
  }, [items, marks]);
  return useCallback((item: WorkItem) => isUnread(item, marks), [marks]);
}

/** Opening an item reads its news: mark it seen now, and again while it stays open. */
export function useMarkSeen(item: WorkItem | null): void {
  const key = item?.key ?? null;
  const changed = item === null ? null : updatedOf(item);
  useEffect(() => {
    if (key === null || changed === null) return;
    const marks = current();
    if ((marks[key] ?? "") >= changed) return;
    write({ ...marks, [key]: changed });
  }, [key, changed]);
}
