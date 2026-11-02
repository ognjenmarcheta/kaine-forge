import type { SyncList } from "@repo/sync";
import { useCallback, useState } from "react";

import { useSyncEngine, useSyncStatus } from "./use-sync";

/**
 * Rows of a list that the first pull left on the server (issue #800): whether
 * any are left, and a way to load the next page of them. It needs the network.
 */
export function useOlderRows(list: SyncList): {
  hasOlder: boolean;
  needsConnection: boolean;
  loading: boolean;
  failed: boolean;
  load: () => Promise<void>;
} {
  const engine = useSyncEngine();
  const status = useSyncStatus();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    if (!engine) return;
    setLoading(true);
    setFailed(false);
    try {
      await engine.loadOlder(list);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [engine, list]);
  return {
    hasOlder: status?.older.includes(list) ?? false,
    needsConnection: status?.state === "offline",
    loading,
    failed,
    load
  };
}
