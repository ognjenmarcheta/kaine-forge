import { cacheExchange, createClient, fetchExchange } from "urql";

import type { AuthSession } from "../features/auth/auth.type";
import { authHeaders } from "../features/auth/auth.util";

const GRAPHQL_URL = process.env.EXPO_PUBLIC_GRAPHQL_URL ?? "http://localhost:4000/graphql";

export function createUrqlClient(session: AuthSession | null) {
  return createClient({
    exchanges: [cacheExchange, fetchExchange],
    fetchOptions: () => ({
      headers: {
        ...authHeaders(session)
      }
    }),
    requestPolicy: "cache-and-network",
    url: GRAPHQL_URL
  });
}
