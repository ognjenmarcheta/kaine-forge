import { getJsonValueSync, setJsonValueSync } from "@repo/persistence";

import { AUTH_DEFINITION } from "./auth.definition";
import type { AuthSession } from "./auth.type";

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function getStoredSession(storageKey: string): AuthSession | null {
  return getJsonValueSync<AuthSession>(getLocalStorage(), storageKey);
}

export function setStoredSession(storageKey: string, session: AuthSession | null): void {
  setJsonValueSync(getLocalStorage(), storageKey, session);
}

/**
 * Web is cookie-first: do not read a durable bearer token from storage.
 * Mobile/desktop may still use bearer transport; web adapters should no-op writes.
 */
export function getStoredSessionToken(storageKey: string): string | null {
  void storageKey;
  return null;
}

/**
 * Clear any legacy token key if present; never persist a new bearer token on web.
 */
export function setStoredSessionToken(storageKey: string, sessionToken: string | null): void {
  const storage = getLocalStorage();

  if (!storage) {
    return;
  }

  // Always remove; ignore sessionToken so web never keeps a durable bearer.
  void sessionToken;
  storage.removeItem(storageKey);
  // Migrate away from the historical key if callers pass a different one.
  if (storageKey !== AUTH_DEFINITION.tokenStorageKey) {
    storage.removeItem(AUTH_DEFINITION.tokenStorageKey);
  }
}

/** Cookie credentials carry the session; GraphQL/auth clients must not attach Bearer. */
export function authHeaders(session: AuthSession | null): Record<string, string> {
  void session;
  return {};
}
