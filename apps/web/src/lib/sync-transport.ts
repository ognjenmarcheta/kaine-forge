import { SyncAuthError, SyncRequestError, type SyncTransport } from "@repo/sync";
import { ClientError, type GraphQLClient } from "graphql-request";

import {
  SyncPullDocument,
  SyncPushDocument,
  type SyncPullQuery,
  type SyncPullQueryVariables,
  type SyncPushMutation,
  type SyncPushMutationVariables
} from "../graphql/generated/react-query";

/** Errors that mean this session cannot sync this Organization now. */
const AUTH_MESSAGES = new Set([
  "authentication required",
  "active organization required",
  "organization not accessible"
]);

/**
 * Turns a failed request into what the sync engine acts on: a session
 * problem pauses the Outbox, a refused request drops it, and anything else
 * (no network, a server error) retries.
 */
function classify(error: unknown): unknown {
  if (!(error instanceof ClientError)) return error;
  if (error.response.status === 401) return new SyncAuthError("authentication required");
  for (const graphqlError of error.response.errors ?? []) {
    if (AUTH_MESSAGES.has(graphqlError.message)) return new SyncAuthError(graphqlError.message);
    if (graphqlError.extensions?.["code"] === "BAD_USER_INPUT") {
      return new SyncRequestError(graphqlError.message);
    }
  }
  return error;
}

export function createSyncTransport(client: GraphQLClient): SyncTransport {
  return {
    async pull(cursor) {
      try {
        const { syncPull } = await client.request<SyncPullQuery, SyncPullQueryVariables>(
          String(SyncPullDocument),
          { cursor }
        );
        return syncPull;
      } catch (error) {
        throw classify(error);
      }
    },
    async push(idempotencyKey, mutations) {
      try {
        const { syncPush } = await client.request<SyncPushMutation, SyncPushMutationVariables>(
          String(SyncPushDocument),
          { input: { idempotencyKey, mutations } }
        );
        return syncPush.results;
      } catch (error) {
        throw classify(error);
      }
    }
  };
}
