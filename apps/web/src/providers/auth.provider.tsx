import { createClientSessionLifecycle } from "@repo/auth/session";
import { createClientAuthTransition, queryKeys } from "@repo/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useMemo, type ReactNode } from "react";

import { AUTH_DEFINITION } from "../features/auth/auth.definition";
import type { AuthContextValue, AuthSession } from "../features/auth/auth.type";
import {
  getStoredSession,
  setStoredSession,
  setStoredSessionToken
} from "../features/auth/auth.util";
import { authTransport } from "../lib/auth-api";
import { disposeSubscriptionClient } from "../lib/graphql-subscription-client";
import { queryRuntime } from "../lib/query-runtime";

export const AuthContext = createContext<AuthContextValue | null>(null);

const sessionLifecycle = createClientSessionLifecycle({
  auth: authTransport,
  // A session check that cannot reach the API (offline, or the API down)
  // keeps the last session, so the app and its local Todos and Notes stay
  // usable. A real sign-out still returns null and signs the user out.
  fallbackToStoredSession: true,
  persistence: {
    getStoredSession: () => getStoredSession(AUTH_DEFINITION.storageKey),
    setStoredSession: (session) => setStoredSession(AUTH_DEFINITION.storageKey, session),
    clearSessionToken: () => setStoredSessionToken(AUTH_DEFINITION.tokenStorageKey, null)
  }
});

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

  const login = useCallback<AuthContextValue["login"]>(
    async (input) => {
      await authTransition.login(input);
    },
    [authTransition]
  );

  const signup = useCallback<AuthContextValue["signup"]>(
    async (input) => {
      await authTransition.signup(input);
    },
    [authTransition]
  );

  const completeSignIn = useCallback<AuthContextValue["completeSignIn"]>(
    async (signIn) => {
      await authTransition.authenticate(() => sessionLifecycle.completeSignIn(signIn));
    },
    [authTransition]
  );

  const refreshSession = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.session() });
  }, [queryClient]);

  const logout = useCallback(async () => {
    void session;
    await authTransition.logout();
  }, [authTransition, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      completeSignIn,
      isLoading: sessionQuery.status === "pending",
      login,
      logout,
      refreshSession,
      session,
      signup
    }),
    [completeSignIn, login, logout, refreshSession, session, sessionQuery.status, signup]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
