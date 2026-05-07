import { createClientSessionLifecycle } from "@repo/auth/session";
import { queryKeys, resetAuthBoundQueries } from "@repo/query";
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

export const AuthContext = createContext<AuthContextValue | null>(null);

const sessionLifecycle = createClientSessionLifecycle({
  auth: authTransport,
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

  const session = (sessionQuery.data ?? null) as AuthSession | null;

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const nextSession = await loginMutation.mutateAsync(input);
      queryClient.setQueryData(queryKeys.session(), nextSession);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organizations()
      });
    },
    [loginMutation, queryClient]
  );

  const signup = useCallback(
    async (input: { email: string; name: string; password: string }) => {
      const nextSession = await signupMutation.mutateAsync(input);
      queryClient.setQueryData(queryKeys.session(), nextSession);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organizations()
      });
    },
    [queryClient, signupMutation]
  );

  const logout = useCallback(async () => {
    void session;
    await logoutMutation.mutateAsync();
    disposeSubscriptionClient();
    resetAuthBoundQueries(queryClient);
    queryClient.setQueryData(queryKeys.session(), null);
  }, [logoutMutation, queryClient, session]);

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
