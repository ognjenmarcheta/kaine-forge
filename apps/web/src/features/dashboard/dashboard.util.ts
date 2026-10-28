const GETTING_STARTED_KEY = "kaine.dashboard.gettingStarted.dismissed";

function dismissalKey(userId: string): string {
  return `${GETTING_STARTED_KEY}:${userId}`;
}

// Storage can be missing or throw (private windows, blocked site data). The
// checklist then stays visible for this visit, which is the safe default.
export function readGettingStartedDismissed(userId: string): boolean {
  try {
    return window.localStorage.getItem(dismissalKey(userId)) === "true";
  } catch {
    return false;
  }
}

export function writeGettingStartedDismissed(userId: string): void {
  try {
    window.localStorage.setItem(dismissalKey(userId), "true");
  } catch {
    // The dismissal lasts until reload when storage is unavailable.
  }
}
