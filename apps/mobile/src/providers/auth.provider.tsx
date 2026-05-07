import AsyncStorage from "@react-native-async-storage/async-storage";
import { createLogger } from "@repo/logger";
import {
  createAsyncStoragePersistenceAdapter,
  getJsonValue,
  setJsonValue
} from "@repo/persistence";
import { queryKeys, resetAuthBoundQueries } from "@repo/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useEffect, useMemo, type ReactNode } from "react";

import { AUTH_DEFINITION } from "../features/auth/auth.definition";
import type { AuthContextValue, AuthSession } from "../features/auth/auth.type";
import { getStoredSessionToken, setStoredSessionToken } from "../features/auth/auth.util";
import { fetchSession, loginRequest, logoutRequest, signupRequest } from "../lib/auth-api";
import { disposeSubscriptionClient } from "../lib/graphql-subscription-client";

const logger = createLogger({ name: "mobile-auth" });
const persistence = createAsyncStoragePersistenceAdapter(AsyncStorage);

async function getStoredSession(storageKey: string): Promise<AuthSession | null> {
  return getJsonValue<AuthSession>(persistence, storageKey);
}

async function setStoredSession(storageKey: string, session: AuthSession | null): Promise<void> {
  await setJsonValue(persistence, storageKey, session);
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
      await getStoredSessionToken(AUTH_DEFINITION.tokenStorageKey);
      const storedSession = await getStoredSession(AUTH_DEFINITION.storageKey);

      try {
        return await fetchSession(storedSession);
      } catch (error) {
        logger.warn({ err: error }, "auth session refresh failed");

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
      logger.warn({ err: error }, "auth logout request failed");
    }

    disposeSubscriptionClient();
    resetAuthBoundQueries(queryClient);
    queryClient.setQueryData(queryKeys.session(), null);
    await setStoredSession(AUTH_DEFINITION.storageKey, null);
    await setStoredSessionToken(AUTH_DEFINITION.tokenStorageKey, null);
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
