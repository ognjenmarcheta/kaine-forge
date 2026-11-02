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
import { deleteOtherUsersStorage, openDeviceStorage } from "../lib/sync-storage";
import {
  createAsyncStorageOutbox,
  createExpoNetworkDetector,
  singleProcessLeader
} from "../lib/sync-stores";
import { createSyncTransport } from "../lib/sync-transport";

export interface SyncContextValue {
  /** The engine of the signed-in User's Active Organization, or null without one. */
  engine: SyncEngine | null;
  /** The last change the server refused; the engine rolls it back right after. */
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
 * engine; its Outbox and stored rows stay on the device under their own names
 * and resume when the User returns to that Organization.
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
    // A rejection belongs to the scope that pushed it.
    setRejection(null);
    if (!scope || !userId || !activeOrganizationId) {
      setCurrent(null);
      return;
    }
    const organizationId = activeOrganizationId;
    let stopped = false;
    let stop: (() => void) | null = null;
    void (async () => {
      // Best effort: on a failure, startup goes on.
      await deleteOtherUsersStorage(userId).catch(() => undefined);
      const device = await openDeviceStorage({ userId, organizationId });
      if (stopped) {
        await device?.close();
        return;
      }
      const onlineDetector = createExpoNetworkDetector();
      const engine = createSyncEngine({
        transport: createSyncTransport(createGraphqlClient(latestSession.current)),
        storage: createAsyncStorageOutbox({ userId, organizationId }),
        onlineDetector,
        leaderElection: singleProcessLeader,
        ...(device ? { persistence: device.persistence } : {}),
        onRejected: setRejection
      });
      stop = () => {
        engine.dispose();
        onlineDetector.dispose();
        void device?.close();
      };
      setCurrent({ scope, engine });
    })();
    return () => {
      stopped = true;
      stop?.();
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
