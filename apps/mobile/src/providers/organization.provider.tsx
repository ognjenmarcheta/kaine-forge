import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersistenceAdapter } from "@repo/persistence";
import {
  createActiveOrganizationMutationHandlers,
  createActiveOrganizationLifecycle,
  createActiveOrganizationProviderState,
  syncActiveOrganizationProvider,
  queryKeys
} from "@repo/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useEffect, useMemo, type ReactNode } from "react";

import { useAuth } from "../hooks/use-auth";
import {
  createOrganizationRequest,
  listOrganizationsRequest,
  setActiveOrganizationRequest,
  type OrganizationOption
} from "../lib/auth-api";
import { queryRuntime } from "../lib/query-runtime";

export interface OrganizationContextValue {
  activeOrganizationId: string | null;
  organizations: OrganizationOption[];
  isLoading: boolean;
  createOrganization: (name: string) => Promise<void>;
  setActiveOrganization: (organizationId: string) => Promise<void>;
}

const ORGANIZATION_STORAGE_KEY = "kaine.mobile.organization.active";
const persistence = createAsyncStoragePersistenceAdapter(AsyncStorage);

async function readStoredOrganizationId(): Promise<string | null> {
  return persistence.getString(ORGANIZATION_STORAGE_KEY);
}

async function writeStoredOrganizationId(organizationId: string | null): Promise<void> {
  if (!organizationId) {
    await persistence.remove(ORGANIZATION_STORAGE_KEY);
    return;
  }

  await persistence.setString(ORGANIZATION_STORAGE_KEY, organizationId);
}

export const OrganizationContext = createContext<OrganizationContextValue | null>(null);

interface OrganizationProviderProps {
  children: ReactNode;
}

export function OrganizationProvider({ children }: OrganizationProviderProps) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const organizationsQuery = useQuery({
    queryKey: queryKeys.organizations(),
    queryFn: listOrganizationsRequest,
    enabled: Boolean(session),
    staleTime: 30 * 1000
  });

  const activeOrganizationMutationHandlers = useMemo(
    () =>
      createActiveOrganizationMutationHandlers({
        queryClient,
        queryRuntime,
        persistActiveOrganizationId: writeStoredOrganizationId
      }),
    [queryClient]
  );

  const setActiveOrganizationMutation = useMutation({
    mutationFn: setActiveOrganizationRequest,
    onSuccess: async (nextSession) => {
      await activeOrganizationMutationHandlers.applyActiveOrganization(nextSession);
    }
  });

  const activeOrganizationLifecycle = useMemo(
    () =>
      createActiveOrganizationLifecycle({
        isOrganizationUiVisible: () => true,
        persistActiveOrganizationId: writeStoredOrganizationId,
        queryClient,
        queryRuntime,
        readActiveOrganizationId: readStoredOrganizationId,
        setActiveOrganization: (organizationId) =>
          setActiveOrganizationMutation.mutateAsync(organizationId)
      }),
    [queryClient, setActiveOrganizationMutation]
  );

  const createOrganizationMutation = useMutation({
    mutationFn: createOrganizationRequest,
    onSuccess: async (nextSession) => {
      await activeOrganizationMutationHandlers.applyCreatedOrganization(nextSession);
    }
  });

  useEffect(() => {
    let isActive = true;

    void (async () => {
      if (!isActive) {
        return;
      }

      await syncActiveOrganizationProvider({
        lifecycle: activeOrganizationLifecycle,
        organizationsPayload: organizationsQuery.data,
        persistActiveOrganizationId: writeStoredOrganizationId,
        session,
        setActiveOrganizationStatus: setActiveOrganizationMutation.status
      });
    })();

    return () => {
      isActive = false;
    };
  }, [
    activeOrganizationLifecycle,
    organizationsQuery.data,
    session,
    setActiveOrganizationMutation
  ]);

  const setActiveOrganization = useCallback(
    async (organizationId: string) => {
      await setActiveOrganizationMutation.mutateAsync(organizationId);
    },
    [setActiveOrganizationMutation]
  );

  const createOrganization = useCallback(
    async (name: string) => {
      await createOrganizationMutation.mutateAsync(name);
    },
    [createOrganizationMutation]
  );

  const providerState = useMemo(
    () =>
      createActiveOrganizationProviderState({
        activeOrganizationId: session?.activeOrganizationId ?? null,
        createOrganizationStatus: createOrganizationMutation.status,
        organizations: organizationsQuery.data?.organizations ?? [],
        organizationsStatus: organizationsQuery.status,
        organizationsVisible: true,
        setActiveOrganizationStatus: setActiveOrganizationMutation.status
      }),
    [
      createOrganizationMutation.status,
      organizationsQuery.data?.organizations,
      organizationsQuery.status,
      session?.activeOrganizationId,
      setActiveOrganizationMutation.status
    ]
  );

  const value = useMemo<OrganizationContextValue>(
    () => ({
      activeOrganizationId: providerState.activeOrganizationId,
      organizations: providerState.organizations,
      isLoading: providerState.isLoading,
      createOrganization,
      setActiveOrganization
    }),
    [createOrganization, providerState, setActiveOrganization]
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}
