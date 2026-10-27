import { createActiveOrganizationQueryKey } from "@repo/query";
import { useInfiniteQuery } from "@tanstack/react-query";

import { API_KEYS_CONFIG } from "./api-keys.config";
import {
  ApiKeysDocument,
  useApiKeysQuery,
  type ApiKeysQuery,
  type ApiKeysQueryVariables
} from "../../graphql/generated/react-query";
import { useGraphqlFetcher } from "../../lib/graphql-codegen-fetcher";
import { useOrganizationPermissions } from "../organizations/organizations.hook";

const FIRST_PAGE: string | null = null;

/**
 * Whether the session may see the Active Organization's API Keys: true with
 * `apiKey:read`, false otherwise, null while unknown. The API enforces it.
 */
export function useApiKeysAccess(organizationId: string | null): boolean | null {
  const permissions = useOrganizationPermissions(organizationId);
  return permissions ? permissions.has("apiKey:read") : null;
}

/** The query key every API Key list page shares, for invalidation after a write. */
export function apiKeysQueryKey(organizationId: string | null) {
  return createActiveOrganizationQueryKey(
    [...useApiKeysQuery.getKey({ first: API_KEYS_CONFIG.pageSize }), "pages"],
    organizationId
  );
}

/** The Active Organization's API Keys, newest first, one cursor page at a time. */
export function useApiKeys(organizationId: string | null, enabled: boolean) {
  const fetchApiKeys = useGraphqlFetcher<ApiKeysQuery, ApiKeysQueryVariables>(ApiKeysDocument);

  return useInfiniteQuery({
    queryKey: apiKeysQueryKey(organizationId),
    enabled,
    initialPageParam: FIRST_PAGE,
    queryFn: ({ pageParam }) => fetchApiKeys({ after: pageParam, first: API_KEYS_CONFIG.pageSize }),
    getNextPageParam: ({ apiKeys: { pageInfo } }) =>
      pageInfo.hasNextPage ? pageInfo.endCursor : undefined
  });
}
