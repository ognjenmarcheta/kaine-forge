import { createClient, type Client } from "graphql-ws";

import { authHeaders } from "../features/auth/auth.util";

let subscriptionClient: Client | null = null;

function resolveWsUrl(): string {
  if (typeof window === "undefined") {
    return "ws://localhost:3000/graphql";
  }

  const graphqlUrl = import.meta.env.VITE_GRAPHQL_URL ?? "/graphql";
  const httpUrl = new URL(graphqlUrl, window.location.origin);
  httpUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
  return httpUrl.toString();
}

export function getSubscriptionClient(): Client {
  if (!subscriptionClient) {
    subscriptionClient = createClient({
      url: resolveWsUrl(),
      connectionParams: () => authHeaders(null),
      shouldRetry: () => true,
      retryAttempts: Infinity,
      retryWait: async (retryCount) => {
        const delay = Math.min(1000 * 2 ** retryCount, 30_000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    });
  }
  return subscriptionClient;
}

export function disposeSubscriptionClient(): void {
  if (subscriptionClient) {
    subscriptionClient.dispose();
    subscriptionClient = null;
  }
}
