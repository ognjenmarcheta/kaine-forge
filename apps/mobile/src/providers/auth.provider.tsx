import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClientSessionLifecycle } from "@repo/auth/session";
import { createLogger } from "@repo/logger";
import {
  createAsyncStoragePersistenceAdapter,
  getJsonValue,
  setJsonValue
} from "@repo/persistence";
import { createClientAuthTransition, queryKeys } from "@repo/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useMemo, type ReactNode } from "react";

import { AUTH_DEFINITION } from "../features/auth/auth.definition";
import type { AuthContextValue, AuthSession } from "../features/auth/auth.type";
import { setStoredSessionToken } from "../features/auth/auth.util";
import { authTransport } from "../lib/auth-api";
import { disposeSubscriptionClient } from "../lib/graphql-subscription-client";
import { queryRuntime } from "../lib/query-runtime";

const logger = createLogger({ name: "mobile-auth" });
const persistence = createAsyncStoragePersistenceAdapter(AsyncStorage);

async function getStoredSession(storageKey: string): Promise<AuthSession | null> {
  return getJsonValue<AuthSession>(persistence, storageKey);
}

async function setStoredSession(storageKey: string, session: AuthSession | null): Promise<void> {
  await setJsonValue(persistence, storageKey, session);
}

const sessionLifecycle = createClientSessionLifecycle({
  auth: authTransport,
  fallbackToStoredSession: true,
  onLogoutError: (error) => {
    logger.warn({ err: error }, "auth logout request failed");
  },
  onRefreshError: (error) => {
    logger.warn({ err: error }, "auth session refresh failed");
  },
  persistence: {
    getStoredSession: () => getStoredSession(AUTH_DEFINITION.storageKey),
    setStoredSession: (session) => setStoredSession(AUTH_DEFINITION.storageKey, session),
    clearSessionToken: () => setStoredSessionToken(AUTH_DEFINITION.tokenStorageKey, null)
  }
});

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: queryKeys.session(),
    queryFn: () => sessionLifecycle.refreshSession(),
    staleTime: 0
  });

  const loginMutation = useMutation({
    mutationFn: sessionLifecycle.loginWithPassword
  });

  const signupMutation = useMutation({
    mutationFn: sessionLifecycle.signupWithPassword
  });

  const logoutMutation = useMutation({
    mutationFn: sessionLifecycle.logout
  });

  const session: AuthSession | null = sessionQuery.data ?? null;

  const authTransition = useMemo(
    () =>
      createClientAuthTransition({
        disposeSubscriptions: disposeSubscriptionClient,
        loginWithPassword: loginMutation.mutateAsync,
        logout: logoutMutation.mutateAsync,
        queryClient,
        queryRuntime,
        signupWithPassword: signupMutation.mutateAsync
      }),
    [loginMutation.mutateAsync, logoutMutation.mutateAsync, queryClient, signupMutation.mutateAsync]
  );

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      await authTransition.login(input);
    },
    [authTransition]
  );

  const signup = useCallback(
    async (input: { email: string; name: string; password: string }) => {
      await authTransition.signup(input);
    },
    [authTransition]
  );

  const logout = useCallback(async () => {
    void session;
    await authTransition.logout();
  }, [authTransition, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading: sessionQuery.status === "pending",
      login,
      logout,
      session,
      signup
    }),
    [login, logout, session, sessionQuery.status, signup]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
