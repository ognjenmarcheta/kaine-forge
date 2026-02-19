import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { AUTH_CONFIG } from "../features/auth/auth.config";
import { AUTH_DEFINITION } from "../features/auth/auth.definition";
import type { AuthContextValue, AuthSession } from "../features/auth/auth.type";
import { authHeaders, getStoredSession, setStoredSession } from "../features/auth/auth.util";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`auth request failed (${String(response.status)})`);
  }

  return (await response.json()) as T;
}

async function loginRequest(input: { email: string; password: string }): Promise<AuthSession> {
  const response = await fetch(AUTH_CONFIG.routes.login, {
    body: JSON.stringify(input),
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  const body = await parseJson<{ session: AuthSession }>(response);
  return body.session;
}

async function fetchSession(session: AuthSession | null): Promise<AuthSession | null> {
  const response = await fetch(AUTH_CONFIG.routes.session, {
    credentials: "include",
    headers: authHeaders(session),
    method: "GET"
  });

  if (response.status === 204) {
    return null;
  }

  const body = await parseJson<{ session: AuthSession | null }>(response);
  return body.session;
}

async function logoutRequest(session: AuthSession | null): Promise<void> {
  await fetch(AUTH_CONFIG.routes.logout, {
    credentials: "include",
    headers: authHeaders(session),
    method: "POST"
  });
}

async function signupRequest(input: {
  email: string;
  name: string;
  password: string;
}): Promise<AuthSession> {
  const response = await fetch(AUTH_CONFIG.routes.signup, {
    body: JSON.stringify(input),
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  const body = await parseJson<{ session: AuthSession }>(response);
  return body.session;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(() =>
    getStoredSession(AUTH_DEFINITION.storageKey)
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const storedSession = getStoredSession(AUTH_DEFINITION.storageKey);

    void (async () => {
      const nextSession = await fetchSession(storedSession);

      if (!mounted) {
        return;
      }

      setSession(nextSession);
      setStoredSession(AUTH_DEFINITION.storageKey, nextSession);
      setIsLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (input: { email: string; password: string }) => {
    const nextSession = await loginRequest(input);
    setSession(nextSession);
    setStoredSession(AUTH_DEFINITION.storageKey, nextSession);
  }, []);

  const signup = useCallback(async (input: { email: string; name: string; password: string }) => {
    const nextSession = await signupRequest(input);
    setSession(nextSession);
    setStoredSession(AUTH_DEFINITION.storageKey, nextSession);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest(session);
    setSession(null);
    setStoredSession(AUTH_DEFINITION.storageKey, null);
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
