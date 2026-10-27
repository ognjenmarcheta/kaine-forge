import { createActiveOrganizationQueryKey } from "@repo/query";
import { useInfiniteQuery } from "@tanstack/react-query";

import { AUDIT_CONFIG } from "./audit.config";
import {
  AuditEventsDocument,
  useAuditEventsQuery,
  type AuditEventsQuery,
  type AuditEventsQueryVariables
} from "../../graphql/generated/react-query";
import { useGraphqlFetcher } from "../../lib/graphql-codegen-fetcher";
import { useOrganizationPermissions } from "../organizations/organizations.hook";

const FIRST_PAGE: string | null = null;

/**
 * Whether the session may read the Active Organization's audit log: true with
 * the `audit:read` Permission, false otherwise, null while unknown. The API
 * enforces the same rule; this only hides the page.
 */
export function useAuditLogAccess(organizationId: string | null): boolean | null {
  const permissions = useOrganizationPermissions(organizationId);
  return permissions ? permissions.has("audit:read") : null;
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
