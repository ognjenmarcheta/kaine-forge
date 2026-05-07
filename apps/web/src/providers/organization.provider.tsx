import { FEATURE_FLAGS, isFeatureEnabled, resolveFeatureFlags } from "@repo/feature-flags";
import { createSyncStoragePersistenceAdapter } from "@repo/persistence";
import {
  createActiveOrganizationMutationHandlers,
  createActiveOrganizationLifecycle,
  createActiveOrganizationProviderState,
  syncActiveOrganizationProvider,
  queryKeys
} from "@repo/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useEffect, useMemo, type ReactNode } from "react";

import type { OrganizationOption } from "../features/organizations/organizations.type";
import { useAuth } from "../hooks/use-auth";
import {
  createOrganizationRequest,
  listOrganizationsRequest,
  setActiveOrganizationRequest
} from "../lib/auth-api";
import { queryRuntime } from "../lib/query-runtime";

export interface OrganizationContextValue {
  organizations: OrganizationOption[];
  activeOrganizationId: string | null;
  organizationsVisible: boolean;
  hasError: boolean;
  isLoading: boolean;
  setActiveOrganization: (organizationId: string) => Promise<void>;
  createOrganization: (name: string) => Promise<void>;
}

const ORGANIZATION_STORAGE_KEY = "kaine.organization.active";
const persistence = createSyncStoragePersistenceAdapter(() =>
  typeof window === "undefined" ? null : window.localStorage
);

async function readStoredOrganizationId(): Promise<string | null> {
  return persistence.getString(ORGANIZATION_STORAGE_KEY);
}

function writeStoredOrganizationId(organizationId: string | null): void {
  if (!organizationId) {
    void persistence.remove(ORGANIZATION_STORAGE_KEY);
    return;
  }

  void persistence.setString(ORGANIZATION_STORAGE_KEY, organizationId);
}

export const OrganizationContext = createContext<OrganizationContextValue | null>(null);

interface OrganizationProviderProps {
  children: ReactNode;
}

export function OrganizationProvider({ children }: OrganizationProviderProps) {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const featureFlags = useMemo(() => resolveFeatureFlags(), []);
  const organizationsVisible = isFeatureEnabled(FEATURE_FLAGS.ORGANIZATIONS_VISIBLE, featureFlags);

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
        isOrganizationUiVisible: () => organizationsVisible,
        persistActiveOrganizationId: writeStoredOrganizationId,
        queryClient,
        queryRuntime,
        readActiveOrganizationId: readStoredOrganizationId,
        setActiveOrganization: (organizationId) =>
          setActiveOrganizationMutation.mutateAsync(organizationId)
      }),
    [organizationsVisible, queryClient, setActiveOrganizationMutation]
  );

  const createOrganizationMutation = useMutation({
    mutationFn: createOrganizationRequest,
    onSuccess: async (nextSession) => {
      await activeOrganizationMutationHandlers.applyCreatedOrganization(nextSession);
    }
  });

  const organizations = useMemo(
    () => organizationsQuery.data?.organizations ?? [],
    [organizationsQuery.data?.organizations]
  );
  const activeOrganizationId = session?.activeOrganizationId ?? null;

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

  const providerState = useMemo(
    () =>
      createActiveOrganizationProviderState({
        activeOrganizationId,
        createOrganizationStatus: createOrganizationMutation.status,
        organizations,
        organizationsStatus: organizationsQuery.status,
        organizationsVisible,
        setActiveOrganizationStatus: setActiveOrganizationMutation.status
      }),
    [
      activeOrganizationId,
      createOrganizationMutation.status,
      organizations,
      organizationsQuery.status,
      organizationsVisible,
      setActiveOrganizationMutation.status
    ]
  );

  const value = useMemo<OrganizationContextValue>(
    () => ({
      organizations: providerState.organizations,
      activeOrganizationId: providerState.activeOrganizationId,
      organizationsVisible: providerState.organizationsVisible,
      hasError: providerState.hasError,
      isLoading: providerState.isLoading,
      setActiveOrganization,
      createOrganization
    }),
    [providerState, setActiveOrganization, createOrganization]
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}
