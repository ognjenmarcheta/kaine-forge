import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { AUTH_CONFIG } from "../features/auth/auth.config";
import { AUTH_DEFINITION } from "../features/auth/auth.definition";
import type { AuthContextValue, AuthSession } from "../features/auth/auth.type";
import { authHeaders } from "../features/auth/auth.util";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`auth request failed (${String(response.status)})`);
  }

  return (await response.json()) as T;
}

async function getStoredSession(storageKey: string): Promise<AuthSession | null> {
  const raw = await AsyncStorage.getItem(storageKey);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

async function setStoredSession(storageKey: string, session: AuthSession | null): Promise<void> {
  if (!session) {
    await AsyncStorage.removeItem(storageKey);
    return;
  }

  await AsyncStorage.setItem(storageKey, JSON.stringify(session));
}

async function fetchSession(session: AuthSession | null): Promise<AuthSession | null> {
  const response = await fetch(AUTH_CONFIG.routes.session, {
    headers: authHeaders(session),
    method: "GET"
  });

  if (response.status === 204) {
    return null;
  }

  const body = await parseJson<{ session: AuthSession | null }>(response);
  return body.session;
}

async function loginRequest(input: { email: string; password: string }): Promise<AuthSession> {
  const response = await fetch(AUTH_CONFIG.routes.login, {
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  const body = await parseJson<{ session: AuthSession }>(response);
  return body.session;
}

async function logoutRequest(session: AuthSession | null): Promise<void> {
  await fetch(AUTH_CONFIG.routes.logout, {
    headers: authHeaders(session),
    method: "POST"
  });
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        const storedSession = await getStoredSession(AUTH_DEFINITION.storageKey);
        const nextSession = await fetchSession(storedSession);

        if (!isActive) {
          return;
        }

        setSession(nextSession);
        await setStoredSession(AUTH_DEFINITION.storageKey, nextSession);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  const login = useCallback(async (input: { email: string; password: string }) => {
    const nextSession = await loginRequest(input);
    setSession(nextSession);
    await setStoredSession(AUTH_DEFINITION.storageKey, nextSession);
  }, []);

  const signup = useCallback(
    async (input: { email: string; name: string; password: string }) => {
      await login({ email: input.email, password: input.password });

      setSession((current) =>
        current
          ? {
              ...current,
              user: {
                ...current.user,
                name: input.name
              }
            }
          : current
      );
    },
    [login]
  );

  const logout = useCallback(async () => {
    await logoutRequest(session);
    setSession(null);
    await setStoredSession(AUTH_DEFINITION.storageKey, null);
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      login,
      logout,
      session,
      signup
    }),
    [isLoading, login, logout, session, signup]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
