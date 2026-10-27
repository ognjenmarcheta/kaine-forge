import { isPermission, type Permission } from "@repo/auth/permissions";
import { createActiveOrganizationQueryKey } from "@repo/query";
import { useQuery } from "@tanstack/react-query";

import { ORGANIZATIONS_DEFINITION } from "./organizations.definition";
import { useOrganizationPermissionsQuery } from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { organizationApi } from "../../lib/auth-api";

/**
 * The session's Permissions in the Active Organization, as the API resolves
 * them: an empty set on error, null while unknown. The API enforces every
 * check; this only decides what to show.
 */
export function useOrganizationPermissions(
  organizationId: string | null
): ReadonlySet<Permission> | null {
  const query = useOrganizationPermissionsQuery(undefined, {
    enabled: Boolean(organizationId),
    queryKey: createActiveOrganizationQueryKey(
      useOrganizationPermissionsQuery.getKey(),
      organizationId
    )
  });

  if (!query.isSuccess) {
    return query.isError ? new Set() : null;
  }

  return new Set(query.data.organizationPermissions.filter(isPermission));
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
