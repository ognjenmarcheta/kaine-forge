import type { OnlineDetector } from "@tanstack/offline-transactions";

interface ListenerTarget {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

/** The parts of `window` the detector reads; this package has no DOM types. */
export interface BrowserWindow extends ListenerTarget {
  navigator: { onLine: boolean };
  document: ListenerTarget & { visibilityState: string };
}

/**
 * Online state from the browser's own signal, for web and desktop: pass
 * `window`. TanStack's default detector also counts any visible tab as
 * online, so a page with no network never showed Offline. Here a tab that
 * becomes visible only checks again.
 */
export function createBrowserOnlineDetector(browser: BrowserWindow): OnlineDetector {
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const onVisible = () => {
    if (browser.document.visibilityState === "visible") notify();
  };
  browser.addEventListener("online", notify);
  browser.addEventListener("offline", notify);
  browser.document.addEventListener("visibilitychange", onVisible);
  return {
    isOnline: () => browser.navigator.onLine,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notifyOnline: notify,
    dispose() {
      browser.removeEventListener("online", notify);
      browser.removeEventListener("offline", notify);
      browser.document.removeEventListener("visibilitychange", onVisible);
      listeners.clear();
    }
  };
}
