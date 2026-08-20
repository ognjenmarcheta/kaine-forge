import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { getSubscriptionClient } from "../lib/graphql-subscription-client";

interface UseSubscriptionOptions<TData> {
  query: string;
  variables?: Record<string, unknown>;
  enabled?: boolean;
  onData?: (data: TData) => void;
  invalidateKeys?: readonly (readonly unknown[])[];
}

export function useSubscription<TData = unknown>(options: UseSubscriptionOptions<TData>): void {
  const { query, variables, enabled = true, onData, invalidateKeys } = options;
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
