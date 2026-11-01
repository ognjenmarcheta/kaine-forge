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

/**
 * Opens the device database of one User in one Organization, shared by every
 * tab of that pair: one tab leads it, the others reach it through the leader.
 * Resolves null where the browser cannot store it (no OPFS, a private
 * window); the synced rows then live in memory, as they did before.
 */
export async function openDeviceStorage(
  scope: { userId: string; organizationId: string },
  signal: AbortSignal
): Promise<{ persistence: DevicePersistence; close: () => Promise<void> } | null> {
  const databaseName = `${await deviceDatabasePrefix(scope.userId)}${await namePart(scope.organizationId)}.db`;
  let database: Awaited<ReturnType<typeof openBrowserWASQLiteOPFSDatabase>>;
  try {
    database = await openBrowserWASQLiteOPFSDatabase({ databaseName, signal });
  } catch (error) {
    if (!signal.aborted) console.warn("Synced rows stay in memory: no device storage.", error);
    return null;
  }
  const coordinator = new BrowserCollectionCoordinator({ dbName: databaseName });
  let closing: Promise<void> | null = null;
  const close = () => {
    closing ??= (async () => {
      openDatabases.delete(databaseName);
      coordinator.dispose();
      await database.close?.();
    })();
    return closing;
  };
  openDatabases.set(databaseName, close);
  return { persistence: createBrowserWASQLitePersistence({ database, coordinator }), close };
}

/**
 * Closes this tab's device databases of a User and deletes all of them, for a
 * sign-out. A database another tab still holds stays until that tab closes it.
 */
export async function deleteDeviceStorage(userId: string): Promise<void> {
  const prefix = await deviceDatabasePrefix(userId);
  await Promise.all(
    [...openDatabases].filter(([name]) => name.startsWith(prefix)).map(([, close]) => close())
  );
  const root = await navigator.storage.getDirectory();
  for await (const name of root.keys()) {
    if (name.startsWith(prefix)) await root.removeEntry(name).catch(() => undefined);
  }
}

/**
 * Deletes the device databases of every other User. A browser holds one
 * signed-in User at a time, so another User's stored rows are only a copy of
 * server data that this User must not keep. Their Outbox stays: a session that
 * expires keeps its Pending Changes for that User's next sign-in.
 */
export async function deleteOtherUsersStorage(userId: string): Promise<void> {
  const own = await deviceDatabasePrefix(userId);
  const root = await navigator.storage.getDirectory();
  for await (const name of root.keys()) {
    if (name.startsWith(DEVICE_DATABASE_PREFIX) && !name.startsWith(own)) {
      await root.removeEntry(name).catch(() => undefined);
    }
  }
}
