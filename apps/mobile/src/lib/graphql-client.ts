import { GraphQLClient } from "graphql-request";

import type { AuthSession } from "../features/auth/auth.type";
import { authHeaders } from "../features/auth/auth.util";

const GRAPHQL_URL = process.env.EXPO_PUBLIC_GRAPHQL_URL ?? "http://localhost:4000/graphql";

export function createGraphqlClient(session: AuthSession | null): GraphQLClient {
  return new GraphQLClient(GRAPHQL_URL, {
    credentials: "include",
    headers: {
      ...authHeaders(session)
    }
  });
}
