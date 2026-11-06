import { browserSyncStorePrefix, type SyncEngine, type SyncStatus } from "@repo/sync";
import { useCallback, useContext, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useAuth } from "./use-auth";
import { useTranslation } from "./use-translation";
import { deleteDeviceStorage } from "../lib/sync-storage";
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

/** How long a blocked deletion waits for the connection that blocks it to close. */
const BLOCKED_DELETE_MS = 3000;

/**
 * Deletes one Outbox store; resolves false when the browser refuses or the
 * store stays open. This tab's engine closes its store a moment after the
 * sign-out; another tab can keep it open.
 */
function deleteStore(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    let blocked: ReturnType<typeof setTimeout> | undefined;
    const settle = (deleted: boolean) => {
      clearTimeout(blocked);
      resolve(deleted);
    };
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => settle(true);
    request.onerror = () => settle(false);
    request.onblocked = () => {
      blocked = setTimeout(() => settle(false), BLOCKED_DELETE_MS);
    };
  });
}

/**
 * Pending Changes in one Outbox store: its `tx:` keys. A store it cannot read
 * counts as one, so the sign-out asks first instead of deleting it unseen.
 */
function countStorePendingChanges(name: string): Promise<number> {
  return new Promise((resolve) => {
    const request = indexedDB.open(name);
    request.onerror = () => resolve(1);
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
        resolve(1);
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
  const { t } = useTranslation();
  const engine = useSyncEngine();
  const userId = session?.user.id ?? null;
  const signOut = useCallback(async () => {
    await logout();
    if (!userId) return;
    await engine?.clearLocalData().catch(() => undefined);
    // Stores it cannot list may still hold data: that counts as a failed deletion.
    const stores = await browserSyncStores(userId).catch(() => null);
    const deleted = await Promise.all([
      ...(stores ?? []).map(deleteStore),
      deleteDeviceStorage(userId).catch(() => false)
    ]);
    // The sign-out stands either way; what stays is deleted at the next try.
    if (stores === null || deleted.includes(false)) toast.warning(t("sync.signOut.cleanupFailed"));
  }, [engine, logout, t, userId]);
  const countPendingChanges = useCallback(async () => {
    if (!userId) return 0;
    const stores = await browserSyncStores(userId).catch(() => null);
    // Unknown is not zero: assume a Pending Change, so the sign-out asks first.
    if (!stores) return Math.max(1, engine?.getStatus().pending ?? 0);
    const counts = await Promise.all(stores.map(countStorePendingChanges));
    // The active Outbox's count is the engine's own, which is never behind its store.
    return Math.max(
      counts.reduce((sum, count) => sum + count, 0),
      engine?.getStatus().pending ?? 0
    );
  }, [engine, userId]);
  return { signOut, countPendingChanges };
}
