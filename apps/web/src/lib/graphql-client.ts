import { GraphQLClient } from "graphql-request";

import type { AuthSession } from "../features/auth/auth.type";
import { authHeaders } from "../features/auth/auth.util";

function resolveGraphqlUrl(): string {
  const graphqlUrl = import.meta.env.VITE_GRAPHQL_URL ?? "/graphql";
  const origin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
  return new URL(graphqlUrl, origin).toString();
}

export function createGraphqlClient(session: AuthSession | null): GraphQLClient {
  return new GraphQLClient(resolveGraphqlUrl(), {
    credentials: "include",
    headers: {
      ...authHeaders(session)
    }
  });
}
