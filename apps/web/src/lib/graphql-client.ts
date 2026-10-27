import { GraphQLClient } from "graphql-request";

import { getWebEnv } from "../env.config";
import type { AuthSession } from "../features/auth/auth.type";
import { authHeaders } from "../features/auth/auth.util";

function resolveGraphqlUrl(): string {
  const graphqlUrl = getWebEnv().VITE_GRAPHQL_URL;
  const origin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
  return new URL(graphqlUrl, origin).toString();
}

export function createGraphqlClient(session: AuthSession | null): GraphQLClient {
  return new GraphQLClient(resolveGraphqlUrl(), {
    credentials: "include",
    headers: {
      // The API's CSRF guard rejects GET and form/text POSTs without this header.
      "x-graphql-yoga-csrf": "1",
      ...authHeaders(session)
    }
  });
}
