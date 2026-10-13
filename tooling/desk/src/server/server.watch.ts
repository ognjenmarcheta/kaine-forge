import { watch, type FSWatcher } from "node:fs";
import path from "node:path";

import type { IssueListEntry, IssueStore } from "../store/store.issue";

export interface StoreWatcherOptions {
  readonly store: IssueStore;
  /** Poll interval. The poll is the guarantee; `fs.watch` only makes it quicker. */
  readonly pollMs: number;
  /** Use `fs.watch` to trigger a poll sooner. Off in tests that need exact timing. */
  readonly useFsWatch: boolean;
  readonly onChanged: (issueNumber: number) => void;
  readonly onRemoved: (issueNumber: number) => void;
}

export interface StoreWatcher {
  /** Read the store once as the baseline, then watch for changes. Repeated calls share one start. */
  readonly start: () => Promise<void>;
  readonly stop: () => void;
  /** Compare the store with the last reading now. */
  readonly poll: () => Promise<void>;
}

const DEBOUNCE_MS = 50;

const fingerprint = (entry: IssueListEntry): string => {
  const { result } = entry;
  if (result.status === "ok") {
    return `${result.state.stage}|${result.state.status}|${result.state.updatedAt}`;
  }
  return result.status === "unreadable"
    ? `unreadable|${result.reason}|${result.detail}`
    : "missing";
};

/**
 * Notice changes that did not come through this server's runner: a CLI run in
 * another terminal, a state file edited by hand. It compares a fingerprint of
 * each issue with the previous reading. Running only while an event client is
 * connected keeps an idle server free of timers and file watchers.
 */
export const createStoreWatcher = (options: StoreWatcherOptions): StoreWatcher => {
  const { store } = options;
  const known = new Map<number, string>();
  let timer: NodeJS.Timeout | null = null;
  let debounce: NodeJS.Timeout | null = null;
  let watcher: FSWatcher | null = null;
  let polling = false;
  let running = false;
  let starting: Promise<void> | null = null;

  const read = async (): Promise<IssueListEntry[]> => {
    try {
      return await store.list();
    } catch {
      return [];
    }
  };

  const poll = async (): Promise<void> => {
    if (polling || !running) return;
    polling = true;
    try {
      const entries = await read();
      if (!running) return;
      const seen = new Set<number>();
      for (const entry of entries) {
        seen.add(entry.issueNumber);
        const next = fingerprint(entry);
        if (known.get(entry.issueNumber) !== next) {
          known.set(entry.issueNumber, next);
          options.onChanged(entry.issueNumber);
        }
      }
      for (const issueNumber of [...known.keys()]) {
        if (seen.has(issueNumber)) continue;
        known.delete(issueNumber);
        options.onRemoved(issueNumber);
      }
    } finally {
      polling = false;
    }
  };

  const schedulePoll = (): void => {
    if (debounce !== null || !running) return;
    debounce = setTimeout(() => {
      debounce = null;
      void poll();
    }, DEBOUNCE_MS);
  };

  const attachFsWatch = (): void => {
    if (!options.useFsWatch || watcher !== null) return;
    try {
      watcher = watch(path.dirname(store.issueDir(1)), { recursive: true }, schedulePoll);
      watcher.on("error", () => {
        watcher?.close();
        watcher = null;
      });
    } catch {
      // The directory may not exist yet, or recursive watching is not supported. The poll covers it.
      watcher = null;
    }
  };

  return {
    start: () => {
      starting ??= (async () => {
        running = true;
        known.clear();
        for (const entry of await read()) known.set(entry.issueNumber, fingerprint(entry));
        if (!running) return;
        attachFsWatch();
        timer = setInterval(() => {
          attachFsWatch();
          void poll();
        }, options.pollMs);
      })();
      return starting;
    },
    stop: () => {
      running = false;
      starting = null;
      if (timer !== null) clearInterval(timer);
      if (debounce !== null) clearTimeout(debounce);
      timer = null;
      debounce = null;
      watcher?.close();
      watcher = null;
      known.clear();
    },
    poll
  };
};
