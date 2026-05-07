import { FEATURE_FLAGS, isFeatureEnabled, resolveFeatureFlags } from "@repo/feature-flags";
import { createSyncStoragePersistenceAdapter } from "@repo/persistence";
import {
  applyActiveOrganizationSession,
  applyCreatedOrganizationSession,
  createActiveOrganizationLifecycle,
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

  const organizationsQuery = useQuery({
    queryKey: queryKeys.organizations(),
    queryFn: listOrganizationsRequest,
    enabled: Boolean(session),
    staleTime: 30 * 1000
  });

  const setActiveOrganizationMutation = useMutation({
    mutationFn: setActiveOrganizationRequest,
    onSuccess: async (nextSession) => {
      await applyActiveOrganizationSession({
        queryClient,
        queryRuntime,
        session: nextSession,
        persistActiveOrganizationId: writeStoredOrganizationId
      });
    }
  });

  const activeOrganizationLifecycle = useMemo(
    () =>
      createActiveOrganizationLifecycle({
        isOrganizationUiVisible: () =>
          isFeatureEnabled(FEATURE_FLAGS.ORGANIZATIONS_VISIBLE, featureFlags),
        persistActiveOrganizationId: writeStoredOrganizationId,
        queryClient,
        queryRuntime,
        readActiveOrganizationId: readStoredOrganizationId,
        setActiveOrganization: (organizationId) =>
          setActiveOrganizationMutation.mutateAsync(organizationId)
      }),
    [featureFlags, queryClient, setActiveOrganizationMutation]
  );

  const createOrganizationMutation = useMutation({
    mutationFn: createOrganizationRequest,
    onSuccess: async (nextSession) => {
      await applyCreatedOrganizationSession({
        queryClient,
        queryRuntime,
        session: nextSession,
        persistActiveOrganizationId: writeStoredOrganizationId
      });
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

    if (!session) {
      writeStoredOrganizationId(null);
      return () => {
        isActive = false;
      };
    }

    if (!organizationsQuery.data || setActiveOrganizationMutation.status === "pending") {
      return () => {
        isActive = false;
      };
    }

    void (async () => {
      const payload = organizationsQuery.data;

      if (!isActive) {
        return;
      }

      await activeOrganizationLifecycle.sync({
        fallbackOrganizationId: payload.activeOrganizationId ?? session.activeOrganizationId,
        organizations: payload.organizations,
        session
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

  const value = useMemo<OrganizationContextValue>(
    () => ({
      organizations,
      activeOrganizationId,
      organizationsVisible: isFeatureEnabled(FEATURE_FLAGS.ORGANIZATIONS_VISIBLE, featureFlags),
      hasError: organizationsQuery.status === "error",
      isLoading:
        organizationsQuery.status === "pending" ||
        setActiveOrganizationMutation.status === "pending" ||
        createOrganizationMutation.status === "pending",
      setActiveOrganization,
      createOrganization
    }),
    [
      organizations,
      activeOrganizationId,
      featureFlags,
      organizationsQuery.status,
      setActiveOrganizationMutation.status,
      createOrganizationMutation.status,
      setActiveOrganization,
      createOrganization
    ]
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}
