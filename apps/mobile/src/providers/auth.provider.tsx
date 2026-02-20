import AsyncStorage from "@react-native-async-storage/async-storage";
import { queryKeys, resetAuthBoundQueries } from "@repo/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useEffect, useMemo, type ReactNode } from "react";

import { AUTH_DEFINITION } from "../features/auth/auth.definition";
import type { AuthContextValue, AuthSession } from "../features/auth/auth.type";
import { fetchSession, loginRequest, logoutRequest, signupRequest } from "../lib/auth-api";

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

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: queryKeys.session(),
    queryFn: async () => {
      const storedSession = await getStoredSession(AUTH_DEFINITION.storageKey);

      try {
        return await fetchSession(storedSession);
      } catch (error) {
        if (__DEV__) {
          console.warn("auth session refresh failed", error);
        }

        return storedSession;
      }
    },
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

    void setStoredSession(AUTH_DEFINITION.storageKey, session);
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
    try {
      await logoutMutation.mutateAsync(session);
    } catch (error) {
      if (__DEV__) {
        console.warn("auth logout request failed", error);
      }
    }

    resetAuthBoundQueries(queryClient);
    queryClient.setQueryData(queryKeys.session(), null);
    await setStoredSession(AUTH_DEFINITION.storageKey, null);
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
