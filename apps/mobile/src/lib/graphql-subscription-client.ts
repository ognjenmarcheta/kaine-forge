import { createClient, type Client } from "graphql-ws";

import { getMobileEnv } from "../env.config";
import type { AuthSession } from "../features/auth/auth.type";
import { authHeaders } from "../features/auth/auth.util";

const WS_URL = getMobileEnv().EXPO_PUBLIC_GRAPHQL_URL.replace(/^http/, "ws");

let subscriptionClient: Client | null = null;
let currentSession: AuthSession | null = null;

export function getSubscriptionClient(session: AuthSession | null): Client {
  if (subscriptionClient && session !== currentSession) {
    void subscriptionClient.dispose();
    subscriptionClient = null;
  }

  if (!subscriptionClient) {
    currentSession = session;
    subscriptionClient = createClient({
      url: WS_URL,
      connectionParams: () => ({ ...authHeaders(session) }),
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
    void subscriptionClient.dispose();
    subscriptionClient = null;
    currentSession = null;
  }
}
