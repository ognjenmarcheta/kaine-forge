import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AuthSession } from "./auth.type";

let activeSessionToken: string | null = null;

export function setActiveSessionToken(sessionToken: string | null): void {
  activeSessionToken = sessionToken;
}

export async function getStoredSessionToken(storageKey: string): Promise<string | null> {
  const sessionToken = await AsyncStorage.getItem(storageKey);
  setActiveSessionToken(sessionToken);
  return sessionToken;
}

export async function setStoredSessionToken(
  storageKey: string,
  sessionToken: string | null
): Promise<void> {
  setActiveSessionToken(sessionToken);

  if (!sessionToken) {
    await AsyncStorage.removeItem(storageKey);
    return;
  }

  await AsyncStorage.setItem(storageKey, sessionToken);
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
