import { resolveFeatureFlags } from "@repo/feature-flags";
import { invalidateOrgScopedQueries, queryKeys } from "@repo/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useEffect, useMemo, type ReactNode } from "react";

import {
  resolveOrganizationSelection,
  type OrganizationOption
} from "../features/organizations/organization-selection.util";
import { useAuth } from "../hooks/use-auth";
import {
  createOrganizationRequest,
  listOrganizationsRequest,
  setActiveOrganizationRequest
} from "../lib/auth-api";

export interface OrganizationContextValue {
  organizations: OrganizationOption[];
  activeOrganizationId: string | null;
  organizationsVisible: boolean;
  isLoading: boolean;
  setActiveOrganization: (organizationId: string) => Promise<void>;
  createOrganization: (name: string) => Promise<void>;
}

const ORGANIZATION_STORAGE_KEY = "kaine.organization.active";

function readStoredOrganizationId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ORGANIZATION_STORAGE_KEY);
}

function writeStoredOrganizationId(organizationId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!organizationId) {
    window.localStorage.removeItem(ORGANIZATION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(ORGANIZATION_STORAGE_KEY, organizationId);
}

export const OrganizationContext = createContext<OrganizationContextValue | null>(null);

interface OrganizationProviderProps {
  children: ReactNode;
}

export function OrganizationProvider({ children }: OrganizationProviderProps) {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const featureFlags = useMemo(
    () => resolveFeatureFlags(import.meta.env as Record<string, string | undefined>),
    []
  );

  const organizationsQuery = useQuery({
    queryKey: queryKeys.organizations(),
    queryFn: listOrganizationsRequest,
    enabled: Boolean(session),
    staleTime: 30 * 1000
  });

  const setActiveOrganizationMutation = useMutation({
    mutationFn: setActiveOrganizationRequest,
    onSuccess: async (nextSession) => {
      queryClient.setQueryData(queryKeys.session(), nextSession);
      writeStoredOrganizationId(nextSession.activeOrganizationId);
      await invalidateOrgScopedQueries(queryClient);
    }
  });

  const createOrganizationMutation = useMutation({
    mutationFn: createOrganizationRequest,
    onSuccess: async (nextSession) => {
      queryClient.setQueryData(queryKeys.session(), nextSession);
      writeStoredOrganizationId(nextSession.activeOrganizationId);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organizations()
      });
      await invalidateOrgScopedQueries(queryClient);
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
    if (!session) {
      writeStoredOrganizationId(null);
      return;
    }

    if (!organizationsQuery.data || setActiveOrganizationMutation.status === "pending") {
      return;
    }

    const payload = organizationsQuery.data;
    const rememberedOrganizationId = featureFlags.organizationsVisible
      ? readStoredOrganizationId()
      : null;
    const selectedOrganization = resolveOrganizationSelection({
      organizations: payload.organizations,
      rememberedOrganizationId
    });
    const preferredOrganizationId =
      selectedOrganization?.id ?? payload.activeOrganizationId ?? session.activeOrganizationId;

    if (!preferredOrganizationId) {
      writeStoredOrganizationId(null);
      return;
    }

    if (preferredOrganizationId !== session.activeOrganizationId) {
      void setActiveOrganizationMutation.mutateAsync(preferredOrganizationId);
      return;
    }

    writeStoredOrganizationId(preferredOrganizationId);
  }, [
    featureFlags.organizationsVisible,
    organizationsQuery.data,
    session,
    setActiveOrganizationMutation
  ]);

  const value = useMemo<OrganizationContextValue>(
    () => ({
      organizations,
      activeOrganizationId,
      organizationsVisible: featureFlags.organizationsVisible,
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
      featureFlags.organizationsVisible,
      organizationsQuery.status,
      setActiveOrganizationMutation.status,
      createOrganizationMutation.status,
      setActiveOrganization,
      createOrganization
    ]
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}
