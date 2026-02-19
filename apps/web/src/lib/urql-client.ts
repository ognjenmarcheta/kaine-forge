import { cacheExchange, createClient, fetchExchange } from "urql";

import type { AuthSession } from "../features/auth/auth.type";
import { authHeaders } from "../features/auth/auth.util";

export function createUrqlClient(session: AuthSession | null) {
  return createClient({
    exchanges: [cacheExchange, fetchExchange],
    fetchOptions: () => ({
      credentials: "include",
      headers: {
        ...authHeaders(session)
      }
    }),
    requestPolicy: "cache-and-network",
    url: "/graphql"
  });
}
