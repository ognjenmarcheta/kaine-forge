import { browserSyncStorePrefix, type SyncEngine, type SyncStatus } from "@repo/sync";
import { useCallback, useContext, useSyncExternalStore } from "react";

import { useAuth } from "./use-auth";
import { SyncContext } from "../providers/sync.provider";

/** The Active Organization's sync engine, or null while none runs (signed out, no Organization). */
export function useSyncEngine(): SyncEngine | null {
  return useContext(SyncContext);
}

/** The sync engine's status, or null while none runs. */
export function useSyncStatus(): SyncStatus | null {
  const engine = useSyncEngine();
  const subscribe = useCallback(
    (onChange: () => void) => engine?.subscribeStatus(onChange) ?? (() => undefined),
    [engine]
  );
  return useSyncExternalStore(subscribe, () => engine?.getStatus() ?? null);
}

/** The names of every browser Outbox store of a User, in any Organization. */
async function browserSyncStores(userId: string): Promise<string[]> {
  if (typeof indexedDB.databases !== "function") return [];
  const prefix = browserSyncStorePrefix(userId);
  return (await indexedDB.databases()).flatMap(({ name }) =>
    name?.startsWith(prefix) ? [name] : []
  );
}

/** Pending Changes in one Outbox store: its `tx:` keys. */
function countStorePendingChanges(name: string): Promise<number> {
  return new Promise((resolve) => {
    const request = indexedDB.open(name);
    request.onerror = () => resolve(0);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("outbox")) {
        database.close();
        resolve(0);
        return;
      }
      const keys = database.transaction("outbox", "readonly").objectStore("outbox").getAllKeys();
      keys.onerror = () => {
        database.close();
        resolve(0);
      };
      keys.onsuccess = () => {
        database.close();
        resolve(keys.result.filter((key) => String(key).startsWith("tx:")).length);
      };
    };
  });
}

/**
 * Signs out, then deletes this device's sync data for the User in every
 * Organization: an explicit sign-out must not leave their changes on a shared
 * device. Nothing is deleted when the sign-out fails. A session that only
 * expires keeps its Pending Changes for the next sign-in.
 */
export function useSignOut(): {
  signOut: () => Promise<void>;
  /** Pending Changes the sign-out would delete, across all of the User's Organizations. */
  countPendingChanges: () => Promise<number>;
} {
  const { logout, session } = useAuth();
  const engine = useSyncEngine();
  const userId = session?.user.id ?? null;
  const signOut = useCallback(async () => {
    await logout();
    if (!userId) return;
    await engine?.clearLocalData().catch(() => undefined);
    // A store still open in this tab is deleted once its engine closes.
    for (const name of await browserSyncStores(userId).catch(() => [])) {
      indexedDB.deleteDatabase(name);
    }
  }, [engine, logout, userId]);
  const countPendingChanges = useCallback(async () => {
    if (!userId) return 0;
    const counts = await Promise.all(
      (await browserSyncStores(userId).catch(() => [])).map(countStorePendingChanges)
    );
    // The active Outbox's count is the engine's own, which is never behind its store.
    return Math.max(
      counts.reduce((sum, count) => sum + count, 0),
      engine?.getStatus().pending ?? 0
    );
  }, [engine, userId]);
  return { signOut, countPendingChanges };
}
