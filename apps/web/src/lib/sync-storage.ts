import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase
} from "@tanstack/browser-db-sqlite-persistence";

type DevicePersistence = ReturnType<typeof createBrowserWASQLitePersistence>;

/**
 * A short, stable name part for an id. wa-sqlite caps a database path at 64
 * characters, which two UUIDs in plain text would exceed.
 */
async function namePart(id: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The start of every device database name. */
const DEVICE_DATABASE_PREFIX = "ks-";

/** The start of every device database name of a User, in any Organization. */
async function deviceDatabasePrefix(userId: string): Promise<string> {
  return `${DEVICE_DATABASE_PREFIX}${await namePart(userId)}-`;
}

/** This tab's open device databases, by name, so a sign-out can close them before deleting. */
const openDatabases = new Map<string, () => Promise<void>>();

/** How many sign-outs deleted each User's storage: an open asked for before one is undone. */
const deletions = new Map<string, number>();

/**
 * Removes every OPFS file whose name `match` selects: a database and its
 * journal files. Resolves false when a file stays; without OPFS nothing was stored.
 */
async function removeFiles(match: (name: string) => boolean): Promise<boolean> {
  let root: FileSystemDirectoryHandle;
  try {
    root = await navigator.storage.getDirectory();
  } catch {
    return true;
  }
  let removed = true;
  for await (const name of root.keys()) {
    if (match(name)) {
      await root.removeEntry(name).catch(() => {
        removed = false;
      });
    }
  }
  return removed;
}

/**
 * Whether this build runs in the desktop shell, which loads it from disk. Its
 * Linux webview has no OPFS, so it stores through the shell's own database
 * commands instead, loaded only there.
 */
const inDesktopShell = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface OpenedDatabase {
  persistence: DevicePersistence;
  close: () => Promise<void>;
}

/** An OPFS database, shared by every tab: one tab leads it, the others reach it through the leader. */
async function openBrowserDatabase(
  databaseName: string,
  signal: AbortSignal
): Promise<OpenedDatabase | null> {
  let database: Awaited<ReturnType<typeof openBrowserWASQLiteOPFSDatabase>>;
  try {
    database = await openBrowserWASQLiteOPFSDatabase({ databaseName, signal });
  } catch (error) {
    if (!signal.aborted) console.warn("Synced rows stay in memory: no device storage.", error);
    return null;
  }
  const coordinator = new BrowserCollectionCoordinator({ dbName: databaseName });
  return {
    persistence: createBrowserWASQLitePersistence({ database, coordinator }),
    close: async () => {
      coordinator.dispose();
      await database.close?.();
    }
  };
}

async function openDatabase(
  databaseName: string,
  signal: AbortSignal
): Promise<OpenedDatabase | null> {
  if (!inDesktopShell) return openBrowserDatabase(databaseName, signal);
  const { openDesktopDatabase } = await import("./sync-desktop-storage");
  return openDesktopDatabase(databaseName);
}

/** Deletes the databases whose names `match` selects; resolves false when one stays. */
async function removeDatabases(match: (name: string) => boolean): Promise<boolean> {
  if (!inDesktopShell) return removeFiles(match);
  const { deleteDesktopDatabases } = await import("./sync-desktop-storage");
  return deleteDesktopDatabases(match);
}

/**
 * Opens the device database of one User in one Organization. Resolves null
 * where the device cannot store it (no OPFS, a private window); the synced
 * rows then live in memory, as they did before.
 */
export async function openDeviceStorage(
  scope: { userId: string; organizationId: string },
  signal: AbortSignal
): Promise<{ persistence: DevicePersistence; close: () => Promise<void> } | null> {
  const asked = deletions.get(scope.userId) ?? 0;
  const databaseName = `${await deviceDatabasePrefix(scope.userId)}${await namePart(scope.organizationId)}.db`;
  const opened = await openDatabase(databaseName, signal);
  if (!opened) return null;
  if ((deletions.get(scope.userId) ?? 0) !== asked) {
    // The User signed out while this opened, after the sign-out deleted their data.
    await opened.close();
    await removeDatabases((name) => name.startsWith(databaseName));
    return null;
  }
  let closing: Promise<void> | null = null;
  const close = () => {
    closing ??= (async () => {
      await opened.close();
      // Only once it is closed: a sign-out waits on this before it deletes the data.
      openDatabases.delete(databaseName);
    })();
    return closing;
  };
  openDatabases.set(databaseName, close);
  return { persistence: opened.persistence, close };
}

/**
 * Closes this tab's device databases of a User and deletes all of them, for a
 * sign-out. A database another tab still holds stays until that tab closes it.
 * Resolves false when one stays; the next deletion tries it again.
 */
export async function deleteDeviceStorage(userId: string): Promise<boolean> {
  // Counted at once, so an open the provider asked for earlier undoes itself.
  deletions.set(userId, (deletions.get(userId) ?? 0) + 1);
  const prefix = await deviceDatabasePrefix(userId);
  await Promise.all(
    [...openDatabases].filter(([name]) => name.startsWith(prefix)).map(([, close]) => close())
  );
  return removeDatabases((name) => name.startsWith(prefix));
}

/**
 * Deletes the device databases of every other User. A browser holds one
 * signed-in User at a time, so another User's stored rows are only a copy of
 * server data that this User must not keep. Their Outbox stays: a session that
 * expires keeps its Pending Changes for that User's next sign-in.
 */
export async function deleteOtherUsersStorage(userId: string): Promise<void> {
  const own = await deviceDatabasePrefix(userId);
  await removeDatabases((name) => name.startsWith(DEVICE_DATABASE_PREFIX) && !name.startsWith(own));
}
