import { GraphQLClient } from "graphql-request";

import type { AuthSession } from "../features/auth/auth.type";
import { authHeaders } from "../features/auth/auth.util";

function resolveGraphqlUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:3000/graphql";
  }

  return new URL("/graphql", window.location.origin).toString();
}

export function createGraphqlClient(session: AuthSession | null): GraphQLClient {
  return new GraphQLClient(resolveGraphqlUrl(), {
    credentials: "include",
    headers: {
      ...authHeaders(session)
    }
  });
}
