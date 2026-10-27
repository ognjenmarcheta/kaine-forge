import {
  DEFAULT_FLAGS,
  FEATURE_FLAGS,
  featureFlagsFromValues,
  isFeatureEnabled
} from "@repo/feature-flags";
import { createSyncStoragePersistenceAdapter } from "@repo/persistence";
import {
  createActiveOrganizationMutationHandlers,
  createActiveOrganizationLifecycle,
  createActiveOrganizationProviderState,
  createActiveOrganizationQueryKey,
  syncActiveOrganizationProvider,
  queryKeys
} from "@repo/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useEffect, useMemo, type ReactNode } from "react";

import type { AuthSession } from "../features/auth/auth.type";
import type { OrganizationOption } from "../features/organizations/organizations.type";
import { useFeatureFlagsQuery } from "../graphql/generated/react-query";
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
  /** After leave, delete, or accept: store the new session and reload organization data. */
  applyOrganizationSession: (session: AuthSession) => Promise<void>;
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
  const { isLoading: isSessionLoading, session } = useAuth();
  const queryClient = useQueryClient();

  const activeOrganizationId = session?.activeOrganizationId ?? null;
  // The API resolves flags for the session: default, environment, then the
  // Active Organization's override. Organization UI stays hidden, and the
  // remembered Organization unused, until the API has answered.
  const featureFlagsQuery = useFeatureFlagsQuery(undefined, {
    enabled: Boolean(session),
    queryKey: createActiveOrganizationQueryKey(useFeatureFlagsQuery.getKey(), activeOrganizationId)
  });
  const isFeatureFlagsPending = Boolean(session) && featureFlagsQuery.isPending;
  const featureFlags = useMemo(
    () =>
      featureFlagsQuery.data
        ? featureFlagsFromValues(featureFlagsQuery.data.featureFlags)
        : DEFAULT_FLAGS,
    [featureFlagsQuery.data]
  );
  const organizationsVisible =
    featureFlagsQuery.isSuccess &&
    isFeatureEnabled(FEATURE_FLAGS.ORGANIZATIONS_VISIBLE, featureFlags);

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
      if (!isActive || isFeatureFlagsPending) {
        return;
      }

      await syncActiveOrganizationProvider({
        isSessionLoading,
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
    isFeatureFlagsPending,
    isSessionLoading,
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

  const applyOrganizationSession = useCallback(
    (nextSession: AuthSession) =>
      activeOrganizationMutationHandlers.applyCreatedOrganization(nextSession),
    [activeOrganizationMutationHandlers]
  );

  const value = useMemo<OrganizationContextValue>(
    () => ({
      organizations: providerState.organizations,
      activeOrganizationId: providerState.activeOrganizationId,
      organizationsVisible: providerState.organizationsVisible,
      hasError: providerState.hasError,
      isLoading: providerState.isLoading || isFeatureFlagsPending,
      setActiveOrganization,
      createOrganization,
      applyOrganizationSession
    }),
    [
      providerState,
      isFeatureFlagsPending,
      setActiveOrganization,
      createOrganization,
      applyOrganizationSession
    ]
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}
