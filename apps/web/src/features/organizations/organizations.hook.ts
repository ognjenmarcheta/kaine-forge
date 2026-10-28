import { isPermission, type Permission } from "@repo/auth/permissions";
import { createActiveOrganizationQueryKey } from "@repo/query";
import { useQuery } from "@tanstack/react-query";

import { ORGANIZATIONS_DEFINITION } from "./organizations.definition";
import { useOrganizationPermissionsQuery } from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { organizationApi } from "../../lib/auth-api";

/** The read of the session's Permissions in the Active Organization. */
export type OrganizationPermissionsState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; permissions: ReadonlySet<Permission> };

/**
 * The session's Permissions in the Active Organization with the state of the
 * read, for a caller that must tell a failed read from no Permissions.
 */
export function useOrganizationPermissionsState(
  organizationId: string | null
): OrganizationPermissionsState {
  const query = useOrganizationPermissionsQuery(undefined, {
    enabled: Boolean(organizationId),
    queryKey: createActiveOrganizationQueryKey(
      useOrganizationPermissionsQuery.getKey(),
      organizationId
    ),
    // The fetcher casts the response without checking it, and the app shell
    // reads this hook. An answer without the list becomes the query's error
    // state (no Permissions), never a throw while the shell renders.
    select: (data) => {
      if (!Array.isArray(data.organizationPermissions)) {
        throw new Error("organizationPermissions response is incomplete");
      }

      return new Set(data.organizationPermissions.filter(isPermission));
    }
  });
  const { refetch } = query;

  if (query.isSuccess) {
    return { status: "success", permissions: query.data };
  }

  return query.isError ? { status: "error", retry: () => void refetch() } : { status: "pending" };
}

/**
 * The session's Permissions in the Active Organization, as the API resolves
 * them: an empty set on error, null while unknown. The API enforces every
 * check; this only decides what to show.
 */
export function useOrganizationPermissions(
  organizationId: string | null
): ReadonlySet<Permission> | null {
  const state = useOrganizationPermissionsState(organizationId);

  if (state.status === "success") {
    return state.permissions;
  }

  return state.status === "error" ? new Set() : null;
}

/** The Active Organization's Custom Roles, read only with `ac:read`. */
export function useCustomRoles(enabled: boolean) {
  const { activeOrganizationId } = useOrganization();

  return useQuery({
    queryKey: createActiveOrganizationQueryKey(
      ORGANIZATIONS_DEFINITION.customRolesScope,
      activeOrganizationId
    ),
    queryFn: organizationApi.listCustomRoles,
    enabled: enabled && Boolean(activeOrganizationId)
  });
}

/** The Active Organization and the session's Permissions in it, for an Organization settings tab. */
export function useOrganizationSettingsAccess() {
  const { activeOrganizationId, organizations, organizationsVisible } = useOrganization();
  // The API answers with the session's Permissions and enforces each one;
  // these only decide which controls show.
  const permissions = useOrganizationPermissions(
    organizationsVisible ? activeOrganizationId : null
  );

  return {
    activeOrganization: organizations.find(
      (organization) => organization.id === activeOrganizationId
    ),
    activeOrganizationId,
    can: (permission: Permission) => permissions?.has(permission) === true,
    permissions
  };
}
