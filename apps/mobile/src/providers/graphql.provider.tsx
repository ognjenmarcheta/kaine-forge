import { useMemo, type ReactNode } from "react";
import { Provider } from "urql";

import { useAuth } from "../hooks/use-auth";
import { createUrqlClient } from "../lib/urql-client";

interface GraphqlProviderProps {
  children: ReactNode;
}

export function GraphqlProvider({ children }: GraphqlProviderProps) {
  const { session } = useAuth();

  const client = useMemo(() => createUrqlClient(session), [session]);

  return <Provider value={client}>{children}</Provider>;
}
