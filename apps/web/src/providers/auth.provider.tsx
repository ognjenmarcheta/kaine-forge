import { queryKeys, resetAuthBoundQueries } from "@repo/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useEffect, useMemo, type ReactNode } from "react";

import { AUTH_DEFINITION } from "../features/auth/auth.definition";
import type { AuthContextValue, AuthSession } from "../features/auth/auth.type";
import { getStoredSession, setStoredSession } from "../features/auth/auth.util";
import { fetchSession, loginRequest, logoutRequest, signupRequest } from "../lib/auth-api";

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: queryKeys.session(),
    queryFn: () => fetchSession(getStoredSession(AUTH_DEFINITION.storageKey)),
    staleTime: 0
  });

  const loginMutation = useMutation({
    mutationFn: loginRequest
  });

  const signupMutation = useMutation({
    mutationFn: signupRequest
  });

  const logoutMutation = useMutation({
    mutationFn: logoutRequest
  });

  const session = (sessionQuery.data ?? null) as AuthSession | null;

  useEffect(() => {
    if (sessionQuery.status === "pending") {
      return;
    }

    setStoredSession(AUTH_DEFINITION.storageKey, session);
  }, [session, sessionQuery.status]);

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
    await logoutMutation.mutateAsync(session);
    resetAuthBoundQueries(queryClient);
    queryClient.setQueryData(queryKeys.session(), null);
    setStoredSession(AUTH_DEFINITION.storageKey, null);
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
