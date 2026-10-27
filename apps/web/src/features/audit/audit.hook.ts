import { hasRoleAtLeast, ORGANIZATION_ROLES, type OrganizationRole } from "@repo/auth/permissions";
import { createActiveOrganizationQueryKey } from "@repo/query";
import { useInfiniteQuery } from "@tanstack/react-query";

import { AUDIT_CONFIG } from "./audit.config";
import {
  AuditEventsDocument,
  useAuditEventsQuery,
  useCurrentOrganizationRoleQuery,
  type AuditEventsQuery,
  type AuditEventsQueryVariables
} from "../../graphql/generated/react-query";
import { useGraphqlFetcher } from "../../lib/graphql-codegen-fetcher";

const FIRST_PAGE: string | null = null;

/**
 * Whether the session's role in the Active Organization may read its audit
 * log: true for an owner or admin, false otherwise, null while unknown. The
 * API enforces the same rule; this only hides the page.
 */
export function useAuditLogAccess(organizationId: string | null): boolean | null {
  const role = useCurrentOrganizationRoleQuery(undefined, {
    enabled: Boolean(organizationId),
    queryKey: createActiveOrganizationQueryKey(
      useCurrentOrganizationRoleQuery.getKey(),
      organizationId
    )
  });

  if (!role.isSuccess) {
    return role.isError ? false : null;
  }

  const ownRole = role.data.currentOrganization?.role;
  // SAFETY: member roles come from the better-auth organization plugin's
  // ORGANIZATION_ROLES vocabulary, and hasRoleAtLeast fails closed for any
  // other string.
  return ownRole ? hasRoleAtLeast(ownRole as OrganizationRole, ORGANIZATION_ROLES.ADMIN) : false;
}

/** The Active Organization's Audit Events, newest first, one cursor page at a time. */
export function useAuditEvents(organizationId: string | null, enabled: boolean) {
  const fetchAuditEvents = useGraphqlFetcher<AuditEventsQuery, AuditEventsQueryVariables>(
    AuditEventsDocument
  );

  return useInfiniteQuery({
    queryKey: createActiveOrganizationQueryKey(
      [...useAuditEventsQuery.getKey({ first: AUDIT_CONFIG.pageSize }), "pages"],
      organizationId
    ),
    enabled,
    initialPageParam: FIRST_PAGE,
    queryFn: ({ pageParam }) =>
      fetchAuditEvents({ after: pageParam, first: AUDIT_CONFIG.pageSize }),
    getNextPageParam: ({ auditEvents: { pageInfo } }) =>
      pageInfo.hasNextPage ? pageInfo.endCursor : undefined
  });
}
