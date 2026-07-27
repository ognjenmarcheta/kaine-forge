import { useCallback, useMemo } from "react";

import { createGraphqlClient } from "./graphql-client";
import { useAuth } from "../hooks/use-auth";

/** GraphQL document as plain string or codegen v6+ TypedDocumentString. */
export type GraphqlDocument = string | { toString(): string };

export function useGraphqlFetcher<TData, TVariables extends Record<string, unknown>>(
  query: GraphqlDocument
): (variables?: TVariables) => Promise<TData> {
  const { session } = useAuth();
  const client = useMemo(() => createGraphqlClient(session), [session]);
  const document = useMemo(() => String(query), [query]);
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
        return request(document);
      }

      return request(document, variables);
    },
    [document, request]
  );
}
