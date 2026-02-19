import { useCallback, useMemo } from "react";

import { createGraphqlClient } from "./graphql-client";
import { useAuth } from "../hooks/use-auth";

export function useGraphqlFetcher<TData, TVariables extends Record<string, unknown>>(
  query: string
): (variables?: TVariables) => Promise<TData> {
  const { session } = useAuth();
  const client = useMemo(() => createGraphqlClient(session), [session]);
  const request = useMemo(
    () =>
      client.request.bind(client) as (
        document: string,
        variables?: Record<string, unknown>
      ) => Promise<TData>,
    [client]
  );

  return useCallback(
    (variables?: TVariables) => {
      if (typeof variables === "undefined") {
        return request(query);
      }

      return request(query, variables);
    },
    [query, request]
  );
}
