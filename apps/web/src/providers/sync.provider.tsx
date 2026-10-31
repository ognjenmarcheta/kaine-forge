import { browserSyncStores, createSyncEngine, type SyncEngine } from "@repo/sync";
import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useAuth } from "../hooks/use-auth";
import { useOrganization } from "../hooks/use-organization";
import { useTranslation } from "../hooks/use-translation";
import { createGraphqlClient } from "../lib/graphql-client";
import { createSyncTransport } from "../lib/sync-transport";

/** The sync engine of the signed-in User's Active Organization, or null without one. */
export const SyncContext = createContext<SyncEngine | null>(null);

/**
 * One sync engine per (User, Active Organization). A switch disposes the old
 * engine; its Outbox stays on the device under its own name and resumes when
 * the User returns to that Organization.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { activeOrganizationId } = useOrganization();
  const { t } = useTranslation();
  const [current, setCurrent] = useState<{ scope: string; engine: SyncEngine } | null>(null);
  const userId = session?.user.id ?? null;
  const scope = userId && activeOrganizationId ? `${userId}:${activeOrganizationId}` : null;
  // Read when an engine starts, so a session refresh does not restart it.
  const latest = useRef({ session, t });
  latest.current = { session, t };

  useEffect(() => {
    if (!scope || !userId || !activeOrganizationId) {
      setCurrent(null);
      return;
    }
    const { storage, leaderElection } = browserSyncStores({
      userId,
      organizationId: activeOrganizationId
    });
    const next = createSyncEngine({
      transport: createSyncTransport(createGraphqlClient(latest.current.session)),
      storage,
      ...(leaderElection ? { leaderElection } : {}),
      onRejected: ({ code }) => {
        toast.error(latest.current.t(`sync.rejected.${code}`));
      }
    });
    setCurrent({ scope, engine: next });
    return () => {
      next.dispose();
    };
  }, [scope, userId, activeOrganizationId]);

  // Right after a switch the effect has not run yet: the previous scope's
  // engine must never reach the new Organization's screens.
  const engine = current?.scope === scope ? current.engine : null;
  return <SyncContext.Provider value={engine}>{children}</SyncContext.Provider>;
}
