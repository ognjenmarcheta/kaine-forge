import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { useQueryClient } from "@tanstack/react-query";
import { print } from "graphql";
import { useEffect, useMemo, useRef } from "react";

import { getSubscriptionClient } from "../lib/graphql-subscription-client";

interface UseSubscriptionOptions<TData, TVariables> {
  /** A generated subscription document (`On…Document`), or a subscription string. */
  query: TypedDocumentNode<TData, TVariables> | string;
  variables?: Record<string, unknown>;
  enabled?: boolean;
  onData?: (data: TData) => void;
  invalidateKeys?: readonly (readonly unknown[])[];
}

export function useSubscription<TData = unknown, TVariables = Record<string, never>>(
  options: UseSubscriptionOptions<TData, TVariables>
): void {
  const { query: source, variables, enabled = true, onData, invalidateKeys } = options;
  // Generated documents are module constants, so this prints once per document.
  const query = useMemo(() => (typeof source === "string" ? source : print(source)), [source]);
  const queryClient = useQueryClient();
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  const invalidateKeysRef = useRef(invalidateKeys);
  invalidateKeysRef.current = invalidateKeys;

  const variablesKey = JSON.stringify(variables);

  useEffect(() => {
    if (!enabled) return;

    const client = getSubscriptionClient();
    const cleanup = client.subscribe<TData>(
      { query, variables },
      {
        next(value) {
          if (value.data && onDataRef.current) {
            onDataRef.current(value.data);
          }
          if (invalidateKeysRef.current) {
            for (const key of invalidateKeysRef.current) {
              void queryClient.invalidateQueries({ queryKey: [...key] });
            }
          }
        },
        error(error) {
          console.error("[subscription]", error);
        },
        complete() {}
      }
    );

    return () => {
      cleanup();
    };
  }, [query, variablesKey, enabled, queryClient]);
}
