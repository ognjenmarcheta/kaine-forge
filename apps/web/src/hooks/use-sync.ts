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

/**
 * Deletes every browser Outbox store of a User, in any Organization. A store
 * still open in this tab is deleted once its engine closes.
 */
async function deleteBrowserSyncStores(userId: string): Promise<void> {
  if (typeof indexedDB.databases !== "function") return;
  const prefix = browserSyncStorePrefix(userId);
  for (const { name } of await indexedDB.databases()) {
    if (name?.startsWith(prefix)) indexedDB.deleteDatabase(name);
  }
}

/**
 * Signs out and deletes this device's sync data for the User: an explicit
 * sign-out must not leave their changes on a shared device. A session that
 * only expires keeps its Pending Changes for the next sign-in.
 */
export function useSignOut(): () => Promise<void> {
  const { logout, session } = useAuth();
  const engine = useSyncEngine();
  const userId = session?.user.id ?? null;
  return useCallback(async () => {
    await engine?.clearLocalData().catch(() => undefined);
    if (userId) await deleteBrowserSyncStores(userId).catch(() => undefined);
    await logout();
  }, [engine, logout, userId]);
}
