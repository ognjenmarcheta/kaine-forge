import { createActiveOrganizationQueryKey } from "@repo/query";
import { useInfiniteQuery } from "@tanstack/react-query";

import { WEBHOOKS_CONFIG } from "./webhooks.config";
import {
  useWebhookDeliveriesQuery,
  useWebhookEndpointsQuery,
  WebhookDeliveriesDocument,
  WebhookEndpointsDocument,
  type WebhookDeliveriesQuery,
  type WebhookDeliveriesQueryVariables,
  type WebhookEndpointsQuery,
  type WebhookEndpointsQueryVariables
} from "../../graphql/generated/react-query";
import { useGraphqlFetcher } from "../../lib/graphql-codegen-fetcher";
import { useOrganizationPermissions } from "../organizations/organizations.hook";

const FIRST_PAGE: string | null = null;

/**
 * Whether the session may see the Active Organization's Webhook Endpoints:
 * true with `webhook:read`, false otherwise, null while unknown.
 */
export function useWebhooksAccess(organizationId: string | null): boolean | null {
  const permissions = useOrganizationPermissions(organizationId);
  return permissions ? permissions.has("webhook:read") : null;
}

/** The query key every Webhook Endpoint list page shares, for invalidation after a write. */
export function webhookEndpointsQueryKey(organizationId: string | null) {
  return createActiveOrganizationQueryKey(
    [...useWebhookEndpointsQuery.getKey({ first: WEBHOOKS_CONFIG.pageSize }), "pages"],
    organizationId
  );
}

/** The Active Organization's Webhook Endpoints, newest first. */
export function useWebhookEndpoints(organizationId: string | null, enabled: boolean) {
  const fetchEndpoints = useGraphqlFetcher<WebhookEndpointsQuery, WebhookEndpointsQueryVariables>(
    WebhookEndpointsDocument
  );

  return useInfiniteQuery({
    queryKey: webhookEndpointsQueryKey(organizationId),
    enabled,
    initialPageParam: FIRST_PAGE,
    queryFn: ({ pageParam }) =>
      fetchEndpoints({ after: pageParam, first: WEBHOOKS_CONFIG.pageSize }),
    getNextPageParam: ({ webhookEndpoints: { pageInfo } }) =>
      pageInfo.hasNextPage ? pageInfo.endCursor : undefined
  });
}

/** One endpoint's delivery attempts, newest first. */
export function useWebhookDeliveries(organizationId: string | null, endpointId: string) {
  const fetchDeliveries = useGraphqlFetcher<
    WebhookDeliveriesQuery,
    WebhookDeliveriesQueryVariables
  >(WebhookDeliveriesDocument);

  return useInfiniteQuery({
    queryKey: createActiveOrganizationQueryKey(
      [
        ...useWebhookDeliveriesQuery.getKey({ endpointId, first: WEBHOOKS_CONFIG.pageSize }),
        "pages"
      ],
      organizationId
    ),
    initialPageParam: FIRST_PAGE,
    queryFn: ({ pageParam }) =>
      fetchDeliveries({ endpointId, after: pageParam, first: WEBHOOKS_CONFIG.pageSize }),
    getNextPageParam: ({ webhookDeliveries: { pageInfo } }) =>
      pageInfo.hasNextPage ? pageInfo.endCursor : undefined
  });
}
