import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SyncEngine, SyncStatus } from "@repo/sync";
import { useCallback, useContext, useSyncExternalStore } from "react";

import { useAuth } from "./use-auth";
import { deleteDeviceStorage } from "../lib/sync-storage";
import { userOutboxKeys } from "../lib/sync-stores";
import { SyncContext, type SyncContextValue } from "../providers/sync.provider";

/** The Active Organization's sync engine, or null while none runs. */
export function useSyncEngine(): SyncEngine | null {
  return useContext(SyncContext).engine;
}

/** The last change the server refused, and a way to dismiss it. */
export function useSyncRejection(): Pick<SyncContextValue, "rejection" | "dismissRejection"> {
  const { rejection, dismissRejection } = useContext(SyncContext);
  return { rejection, dismissRejection };
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
 * Signs out, then deletes this device's sync data for the User in every
 * Organization. Nothing is deleted when the sign-out fails, and a session that
 * only expires keeps its Pending Changes for the next sign-in.
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
    await AsyncStorage.multiRemove(await userOutboxKeys(userId)).catch(() => undefined);
    await deleteDeviceStorage(userId).catch(() => undefined);
  }, [engine, logout, userId]);
  const countPendingChanges = useCallback(async () => {
    if (!userId) return 0;
    const keys = await userOutboxKeys(userId).catch(() => null);
    // Unknown is not zero: assume a Pending Change, so the sign-out asks first.
    if (!keys) return Math.max(1, engine?.getStatus().pending ?? 0);
    // An Outbox entry's key ends in `tx:<id>` under its scope's prefix.
    const stored = keys.filter((key) => key.includes(":tx:")).length;
    return Math.max(stored, engine?.getStatus().pending ?? 0);
  }, [engine, userId]);
  return { signOut, countPendingChanges };
}
