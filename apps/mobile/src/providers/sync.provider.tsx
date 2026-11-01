import { createSyncEngine, type SyncEngine, type SyncRejection } from "@repo/sync";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { useAuth } from "../hooks/use-auth";
import { useOrganization } from "../hooks/use-organization";
import { createGraphqlClient } from "../lib/graphql-client";
import {
  createAsyncStorageOutbox,
  createExpoNetworkDetector,
  singleProcessLeader
} from "../lib/sync-stores";
import { createSyncTransport } from "../lib/sync-transport";

export interface SyncContextValue {
  /** The engine of the signed-in User's Active Organization, or null without one. */
  engine: SyncEngine | null;
  /** The last change the server refused; the engine already rolled it back. */
  rejection: SyncRejection | null;
  dismissRejection: () => void;
}

export const SyncContext = createContext<SyncContextValue>({
  engine: null,
  rejection: null,
  dismissRejection: () => undefined
});

/**
 * One sync engine per (User, Active Organization). A switch disposes the old
 * engine; its Outbox stays in AsyncStorage under its own prefix and resumes
 * when the User returns to that Organization.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { activeOrganizationId } = useOrganization();
  const [current, setCurrent] = useState<{ scope: string; engine: SyncEngine } | null>(null);
  const [rejection, setRejection] = useState<SyncRejection | null>(null);
  const userId = session?.user.id ?? null;
  const scope = userId && activeOrganizationId ? `${userId}:${activeOrganizationId}` : null;
  // Read when an engine starts, so a session refresh does not restart it.
  const latestSession = useRef(session);
  latestSession.current = session;

  useEffect(() => {
    if (!scope || !userId || !activeOrganizationId) {
      setCurrent(null);
      return;
    }
    const onlineDetector = createExpoNetworkDetector();
    const next = createSyncEngine({
      transport: createSyncTransport(createGraphqlClient(latestSession.current)),
      storage: createAsyncStorageOutbox({ userId, organizationId: activeOrganizationId }),
      onlineDetector,
      leaderElection: singleProcessLeader,
      onRejected: setRejection
    });
    setCurrent({ scope, engine: next });
    return () => {
      next.dispose();
      onlineDetector.dispose();
    };
  }, [scope, userId, activeOrganizationId]);

  // Right after a switch the effect has not run yet: the previous scope's
  // engine must never reach the new Organization's screens.
  const engine = current?.scope === scope ? current.engine : null;
  const dismissRejection = useCallback(() => setRejection(null), []);
  const value = useMemo(
    () => ({ engine, rejection, dismissRejection }),
    [engine, rejection, dismissRejection]
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
