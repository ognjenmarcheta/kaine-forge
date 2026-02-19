import { resolveFeatureFlags } from "@repo/feature-flags";
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { AUTH_CONFIG } from "../features/auth/auth.config";
import type { AuthSession } from "../features/auth/auth.type";
import {
  resolveOrganizationSelection,
  type OrganizationOption
} from "../features/organizations/organization-selection.util";
import { useAuth } from "../hooks/use-auth";

interface ListOrganizationsResponse {
  activeOrganizationId: string | null;
  organizations: OrganizationOption[];
}

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

async function fetchOrganizations(): Promise<ListOrganizationsResponse> {
  const response = await fetch(AUTH_CONFIG.routes.organizationList, {
    credentials: "include",
    method: "GET"
  });

  if (!response.ok) {
    throw new Error(`organization list request failed (${String(response.status)})`);
  }

  return (await response.json()) as ListOrganizationsResponse;
}

async function requestSetActiveOrganization(organizationId: string): Promise<void> {
  const response = await fetch(AUTH_CONFIG.routes.setActiveOrganization, {
    body: JSON.stringify({ organizationId }),
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`set active organization request failed (${String(response.status)})`);
  }
}

async function requestCreateOrganization(name: string): Promise<AuthSession> {
  const response = await fetch(AUTH_CONFIG.routes.createOrganization, {
    body: JSON.stringify({ name }),
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`create organization request failed (${String(response.status)})`);
  }

  const payload = (await response.json()) as { session: AuthSession };
  return payload.session;
}

export const OrganizationContext = createContext<OrganizationContextValue | null>(null);

interface OrganizationProviderProps {
  children: ReactNode;
}

export function OrganizationProvider({ children }: OrganizationProviderProps) {
  const { session } = useAuth();
  const featureFlags = useMemo(
    () => resolveFeatureFlags(import.meta.env as Record<string, string | undefined>),
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);

  const setActiveOrganization = useCallback(async (organizationId: string) => {
    await requestSetActiveOrganization(organizationId);
    setActiveOrganizationId(organizationId);
    writeStoredOrganizationId(organizationId);
  }, []);

  const createOrganization = useCallback(async (name: string) => {
    const nextSession = await requestCreateOrganization(name);
    const payload = await fetchOrganizations();
    const nextActiveOrganizationId =
      nextSession.activeOrganizationId ?? payload.activeOrganizationId;

    setOrganizations(payload.organizations);
    setActiveOrganizationId(nextActiveOrganizationId);
    writeStoredOrganizationId(nextActiveOrganizationId);
  }, []);

  useEffect(() => {
    let mounted = true;

    if (!session) {
      setOrganizations([]);
      setActiveOrganizationId(null);
      writeStoredOrganizationId(null);
      return;
    }

    void (async () => {
      setIsLoading(true);

      try {
        const payload = await fetchOrganizations();

        if (!mounted) {
          return;
        }

        setOrganizations(payload.organizations);
        const rememberedOrganizationId = featureFlags.organizationsVisible
          ? readStoredOrganizationId()
          : null;
        const selectedOrganization = resolveOrganizationSelection({
          organizations: payload.organizations,
          rememberedOrganizationId
        });
        const nextActiveOrganizationId =
          selectedOrganization?.id ?? payload.activeOrganizationId ?? null;

        if (
          nextActiveOrganizationId &&
          payload.activeOrganizationId &&
          nextActiveOrganizationId !== payload.activeOrganizationId
        ) {
          await requestSetActiveOrganization(nextActiveOrganizationId);
        }

        setActiveOrganizationId(nextActiveOrganizationId);
        writeStoredOrganizationId(nextActiveOrganizationId);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [featureFlags.organizationsVisible, session]);

  const value = useMemo<OrganizationContextValue>(
    () => ({
      organizations,
      activeOrganizationId,
      organizationsVisible: featureFlags.organizationsVisible,
      isLoading,
      setActiveOrganization,
      createOrganization
    }),
    [
      organizations,
      activeOrganizationId,
      featureFlags.organizationsVisible,
      isLoading,
      setActiveOrganization,
      createOrganization
    ]
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}
