import { createClient, type Client } from "graphql-ws";

let subscriptionClient: Client | null = null;

function resolveWsUrl(): string {
  if (typeof window === "undefined") {
    return "ws://localhost:3000/graphql";
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/graphql`;
}

export function getSubscriptionClient(): Client {
  if (!subscriptionClient) {
    subscriptionClient = createClient({
      url: resolveWsUrl(),
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
