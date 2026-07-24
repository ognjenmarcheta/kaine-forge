import { GraphQLClient } from "graphql-request";

import { getMobileEnv } from "../env.config";
import type { AuthSession } from "../features/auth/auth.type";
import { authHeaders } from "../features/auth/auth.util";

const GRAPHQL_URL = getMobileEnv().EXPO_PUBLIC_GRAPHQL_URL;

export function createGraphqlClient(session: AuthSession | null): GraphQLClient {
  return new GraphQLClient(GRAPHQL_URL, {
    credentials: "include",
    headers: {
      ...authHeaders(session)
    }
  });
}
