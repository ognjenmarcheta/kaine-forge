import type { SyncEngine, SyncStatus } from "@repo/sync";
import { useCallback, useContext, useSyncExternalStore } from "react";

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
