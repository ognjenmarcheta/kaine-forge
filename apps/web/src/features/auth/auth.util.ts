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

export function getStoredSessionToken(storageKey: string): string | null {
  return getLocalStorage()?.getItem(storageKey) ?? null;
}

export function setStoredSessionToken(storageKey: string, sessionToken: string | null): void {
  const storage = getLocalStorage();

  if (!storage) {
    return;
  }

  if (!sessionToken) {
    storage.removeItem(storageKey);
    return;
  }

  storage.setItem(storageKey, sessionToken);
}

export function authHeaders(session: AuthSession | null): Record<string, string> {
  void session;
  const sessionToken = getStoredSessionToken(AUTH_DEFINITION.tokenStorageKey);

  if (!sessionToken) {
    return {};
  }

  return {
    authorization: `Bearer ${sessionToken}`
  };
}
