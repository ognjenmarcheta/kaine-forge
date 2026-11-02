import { browserSyncStores, createSyncEngine, type SyncEngine } from "@repo/sync";
import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { NoteConflictDialog, type NoteConflict } from "../components/sync-note-conflict";
import { useAuth } from "../hooks/use-auth";
import { useOrganization } from "../hooks/use-organization";
import { useTranslation } from "../hooks/use-translation";
import { createGraphqlClient } from "../lib/graphql-client";
import { deleteOtherUsersStorage, openDeviceStorage } from "../lib/sync-storage";
import { createSyncTransport } from "../lib/sync-transport";

/** The sync engine of the signed-in User's Active Organization, or null without one. */
export const SyncContext = createContext<SyncEngine | null>(null);

/**
 * One sync engine per (User, Active Organization). A switch disposes the old
 * engine; its Outbox and stored rows stay on the device under their own names
 * and resume when the User returns to that Organization.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { activeOrganizationId } = useOrganization();
  const { t } = useTranslation();
  const [current, setCurrent] = useState<{ scope: string; engine: SyncEngine } | null>(null);
  // Each refused Note body edit waits here until its writer chooses: none is dropped.
  const [conflicts, setConflicts] = useState<Array<NoteConflict & { scope: string }>>([]);
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
    const organizationId = activeOrganizationId;
    const opening = new AbortController();
    let started: SyncEngine | null = null;
    let closeStorage: (() => Promise<void>) | null = null;
    void (async () => {
      // Best effort: without OPFS or on a failure, startup goes on.
      await deleteOtherUsersStorage(userId).catch(() => undefined);
      const device = await openDeviceStorage({ userId, organizationId }, opening.signal);
      if (opening.signal.aborted) {
        await device?.close();
        return;
      }
      closeStorage = device?.close ?? null;
      const { storage, leaderElection } = browserSyncStores({ userId, organizationId });
      started = createSyncEngine({
        transport: createSyncTransport(createGraphqlClient(latest.current.session)),
        storage,
        ...(leaderElection ? { leaderElection } : {}),
        ...(device ? { persistence: device.persistence } : {}),
        onRejected: ({ code, id, change }) => {
          const body = "noteUpdate" in change ? change.noteUpdate.body : undefined;
          const note = started?.notes.get(id);
          // Another device changed the same lines: the writer chooses, nothing is lost.
          if (code === "CONFLICT" && body !== undefined && note) {
            const conflict = { scope, id, title: note.title, mine: body ?? "" };
            setConflicts((waiting) => [...waiting, conflict]);
            return;
          }
          toast.error(latest.current.t(`sync.rejected.${code}`));
        }
      });
      setCurrent({ scope, engine: started });
    })();
    return () => {
      opening.abort();
      started?.dispose();
      void closeStorage?.();
    };
  }, [scope, userId, activeOrganizationId]);

  // Right after a switch the effect has not run yet: the previous scope's
  // engine must never reach the new Organization's screens.
  const engine = current?.scope === scope ? current.engine : null;
  const shownConflict = conflicts.find((conflict) => conflict.scope === scope) ?? null;
  const settle = (settled: NoteConflict) =>
    setConflicts((waiting) => waiting.filter((conflict) => conflict !== settled));
  return (
    <SyncContext.Provider value={engine}>
      {children}
      <NoteConflictDialog
        engine={engine}
        conflict={shownConflict}
        onKeepCurrent={settle}
        onKeepMine={(conflict) => {
          settle(conflict);
          const { id, mine } = conflict;
          // Sent again from the current body, so the server applies it as it is.
          engine?.updateNote(id, { body: mine.length > 0 ? mine : null }).catch(() => {
            toast.error(t("sync.rejected.NOT_FOUND"));
          });
        }}
      />
    </SyncContext.Provider>
  );
}
