import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersistenceAdapter } from "@repo/persistence";

import type { AuthSession } from "./auth.type";

let activeSessionToken: string | null = null;
const persistence = createAsyncStoragePersistenceAdapter(AsyncStorage);

export function setActiveSessionToken(sessionToken: string | null): void {
  activeSessionToken = sessionToken;
}

export async function getStoredSessionToken(storageKey: string): Promise<string | null> {
  const sessionToken = await persistence.getString(storageKey);
  setActiveSessionToken(sessionToken);
  return sessionToken;
}

export async function setStoredSessionToken(
  storageKey: string,
  sessionToken: string | null
): Promise<void> {
  setActiveSessionToken(sessionToken);

  if (!sessionToken) {
    await persistence.remove(storageKey);
    return;
  }

  await persistence.setString(storageKey, sessionToken);
}

export function authHeaders(session: AuthSession | null): Record<string, string> {
  void session;

  if (!activeSessionToken) {
    return {};
  }

  return {
    authorization: `Bearer ${activeSessionToken}`
  };
}
