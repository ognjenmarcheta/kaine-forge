import { useSyncExternalStore } from "react";

/** How often relative times ("12m in stage", "5 minutes ago") move on. */
export const NOW_TICK_MS = 15_000;

/**
 * One clock for the whole page. Every card, header, and report reads the same timer, so a
 * board with many cards runs one interval, not one for each card. The timer runs only while
 * something on the page reads the time.
 */
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  if (timer === null) {
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, NOW_TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
};

/** While no one listens the stored time can be old; the first reader refreshes it. */
const read = (): number => {
  if (timer === null && Date.now() - now >= NOW_TICK_MS) now = Date.now();
  return now;
};

/** The current time in epoch milliseconds, refreshed by the shared clock. */
export const useNow = (): number => useSyncExternalStore(subscribe, read);
