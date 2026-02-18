import type { AuthSession } from "./auth.type";

function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(key);
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, value);
}

function removeLocalStorage(key: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(key);
}

export function getStoredSession(storageKey: string): AuthSession | null {
  const raw = readLocalStorage(storageKey);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function setStoredSession(storageKey: string, session: AuthSession | null): void {
  if (!session) {
    removeLocalStorage(storageKey);
    return;
  }

  writeLocalStorage(storageKey, JSON.stringify(session));
}

export function authHeaders(session: AuthSession | null): Record<string, string> {
  if (!session) {
    return {};
  }

  return {
    "x-dev-user-email": session.user.email,
    "x-dev-user-id": session.user.id,
    "x-dev-user-name": session.user.name
  };
}
