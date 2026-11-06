import {
  createTauriSQLitePersistence,
  type TauriSQLiteDatabaseLike
} from "@tanstack/tauri-db-sqlite-persistence";
import { invoke } from "@tauri-apps/api/core";

/**
 * Device databases in the desktop shell (ADR 0020): its WebKitGTK webview has
 * no OPFS. The shell's own commands keep them with one SQLite connection each,
 * because TanStack's driver sends a transaction as separate statements.
 */

/**
 * One handle per database for this page, so one driver queue orders every
 * statement it sends: two queues could interleave their transactions.
 */
const handles = new Map<string, Promise<TauriSQLiteDatabaseLike>>();

function handleFor(name: string): Promise<TauriSQLiteDatabaseLike> {
  let handle = handles.get(name);
  if (!handle) {
    // Opening also rolls back a transaction that an earlier page left unfinished.
    handle = invoke("device_db_open", { name }).then((): TauriSQLiteDatabaseLike => ({
      path: name,
      execute: (sql, values = []) => invoke("device_db_execute", { name, sql, values }),
      select: <T>(sql: string, values: unknown[] = []) =>
        invoke<T>("device_db_select", { name, sql, values }),
      // The connection lives as long as the app: deleting the database closes it.
      close: async () => true
    }));
    handles.set(name, handle);
    handle.catch(() => handles.delete(name));
  }
  return handle;
}

/** Opens a device database; resolves null when the shell cannot. */
export async function openDesktopDatabase(name: string): Promise<{
  persistence: ReturnType<typeof createTauriSQLitePersistence>;
  close: () => Promise<void>;
} | null> {
  try {
    const database = await handleFor(name);
    return {
      persistence: createTauriSQLitePersistence({ database }),
      // Releases it for this engine only: the handle stays for the next one.
      close: async () => undefined
    };
  } catch (error) {
    console.warn("Synced rows stay in memory: no device storage.", error);
    return null;
  }
}

/**
 * Closes and deletes the device databases whose names `match` selects.
 * Resolves false when one stays: it is listed again at the next deletion.
 */
export async function deleteDesktopDatabases(match: (name: string) => boolean): Promise<boolean> {
  let deleted = true;
  for (const name of (await invoke<string[]>("device_db_list")).filter(match)) {
    handles.delete(name);
    await invoke("device_db_delete", { name }).catch(() => {
      deleted = false;
    });
  }
  return deleted;
}
