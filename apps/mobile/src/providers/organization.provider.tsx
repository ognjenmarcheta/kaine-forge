import AsyncStorage from "@react-native-async-storage/async-storage";
import { invalidateOrgScopedQueries, queryKeys } from "@repo/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useEffect, useMemo, type ReactNode } from "react";

import { useAuth } from "../hooks/use-auth";
import {
  createOrganizationRequest,
  listOrganizationsRequest,
  setActiveOrganizationRequest,
  type OrganizationOption
} from "../lib/auth-api";

export interface OrganizationContextValue {
  activeOrganizationId: string | null;
  organizations: OrganizationOption[];
  isLoading: boolean;
  createOrganization: (name: string) => Promise<void>;
  setActiveOrganization: (organizationId: string) => Promise<void>;
}

const ORGANIZATION_STORAGE_KEY = "kaine.mobile.organization.active";

async function readStoredOrganizationId(): Promise<string | null> {
  return AsyncStorage.getItem(ORGANIZATION_STORAGE_KEY);
}

async function writeStoredOrganizationId(organizationId: string | null): Promise<void> {
  if (!organizationId) {
    await AsyncStorage.removeItem(ORGANIZATION_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(ORGANIZATION_STORAGE_KEY, organizationId);
}

function resolvePreferredOrganizationId(input: {
  organizations: OrganizationOption[];
  rememberedOrganizationId: string | null;
  fallbackOrganizationId: string | null;
}): string | null {
  if (input.organizations.length === 0) {
    return input.fallbackOrganizationId;
  }

  if (input.rememberedOrganizationId) {
    const remembered = input.organizations.find(
      (organization) => organization.id === input.rememberedOrganizationId
    );

    if (remembered) {
      return remembered.id;
    }
  }

  return input.organizations[0]?.id ?? input.fallbackOrganizationId;
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

  const setActiveOrganizationMutation = useMutation({
    mutationFn: setActiveOrganizationRequest,
    onSuccess: async (nextSession) => {
      queryClient.setQueryData(queryKeys.session(), nextSession);
      await writeStoredOrganizationId(nextSession.activeOrganizationId);
      await invalidateOrgScopedQueries(queryClient);
    }
  });

  const createOrganizationMutation = useMutation({
    mutationFn: createOrganizationRequest,
    onSuccess: async (nextSession) => {
      queryClient.setQueryData(queryKeys.session(), nextSession);
      await writeStoredOrganizationId(nextSession.activeOrganizationId);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organizations()
      });
      await invalidateOrgScopedQueries(queryClient);
    }
  });

  useEffect(() => {
    let isActive = true;

    if (!session) {
      void writeStoredOrganizationId(null);
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
      const rememberedOrganizationId = await readStoredOrganizationId();

      if (!isActive) {
        return;
      }

      const preferredOrganizationId = resolvePreferredOrganizationId({
        organizations: payload.organizations,
        rememberedOrganizationId,
        fallbackOrganizationId: payload.activeOrganizationId ?? session.activeOrganizationId
      });

      if (!preferredOrganizationId) {
        await writeStoredOrganizationId(null);
        return;
      }

      if (preferredOrganizationId !== session.activeOrganizationId) {
        await setActiveOrganizationMutation.mutateAsync(preferredOrganizationId);
        return;
      }

      await writeStoredOrganizationId(preferredOrganizationId);
    })();

    return () => {
      isActive = false;
    };
  }, [organizationsQuery.data, session, setActiveOrganizationMutation]);

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

  const value = useMemo<OrganizationContextValue>(
    () => ({
      activeOrganizationId: session?.activeOrganizationId ?? null,
      organizations: organizationsQuery.data?.organizations ?? [],
      isLoading:
        organizationsQuery.status === "pending" ||
        setActiveOrganizationMutation.status === "pending" ||
        createOrganizationMutation.status === "pending",
      createOrganization,
      setActiveOrganization
    }),
    [
      createOrganization,
      createOrganizationMutation.status,
      organizationsQuery.data?.organizations,
      organizationsQuery.status,
      session?.activeOrganizationId,
      setActiveOrganization,
      setActiveOrganizationMutation.status
    ]
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}
