import { GraphQLClient } from "graphql-request";

import type { AuthSession } from "../features/auth/auth.type";
import { authHeaders } from "../features/auth/auth.util";

export function createGraphqlClient(session: AuthSession | null): GraphQLClient {
  return new GraphQLClient("/graphql", {
    credentials: "include",
    headers: {
      ...authHeaders(session)
    }
  });
}
