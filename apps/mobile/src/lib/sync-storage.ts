import AsyncStorage from "@react-native-async-storage/async-storage";
import { createExpoSQLitePersistence } from "@tanstack/expo-db-sqlite-persistence";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { deleteDatabaseAsync, openDatabaseAsync } from "expo-sqlite";

type DevicePersistence = ReturnType<typeof createExpoSQLitePersistence>;

/** The start of every device database name. */
const DEVICE_DATABASE_PREFIX = "ks-";
/** The device databases this app created: expo-sqlite cannot list them. */
const REGISTRY_KEY = "kaine-sync:databases";

/** A short, stable name part for an id, as the web app names its databases. */
async function namePart(id: string): Promise<string> {
  return (await digestStringAsync(CryptoDigestAlgorithm.SHA256, id)).slice(0, 16);
}

/** The start of every device database name of a User, in any Organization. */
async function deviceDatabasePrefix(userId: string): Promise<string> {
  return `${DEVICE_DATABASE_PREFIX}${await namePart(userId)}-`;
}

async function registeredDatabases(): Promise<string[]> {
  const stored: unknown = JSON.parse((await AsyncStorage.getItem(REGISTRY_KEY)) ?? "[]");
  return Array.isArray(stored)
    ? stored.filter((name): name is string => typeof name === "string")
    : [];
}

async function writeRegistry(names: Iterable<string>): Promise<void> {
  await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify([...new Set(names)]));
}

/** This process's open device databases, by name, so a deletion can close them first. */
const openDatabases = new Map<string, () => Promise<void>>();

/**
 * One queue for every open and deletion: each reads and rewrites the
 * registry, and a deletion must see every database opened before it.
 */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(run: () => Promise<T>): Promise<T> {
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** How many sign-outs deleted each User's storage: an open asked for before one is cancelled. */
const deletions = new Map<string, number>();

/**
 * Opens the device database of one User in one Organization. Resolves null
 * when SQLite cannot open it, or when the User signed out while it waited; the
 * synced rows then live in memory, as before.
 */
export function openDeviceStorage(scope: {
  userId: string;
  organizationId: string;
}): Promise<{ persistence: DevicePersistence; close: () => Promise<void> } | null> {
  const asked = deletions.get(scope.userId) ?? 0;
  return serial(async () => {
    if ((deletions.get(scope.userId) ?? 0) !== asked) return null;
    const databaseName = `${await deviceDatabasePrefix(scope.userId)}${await namePart(scope.organizationId)}.db`;
    // Listed before it exists, so no database file is ever left unlisted.
    await writeRegistry([...(await registeredDatabases()), databaseName]);
    let database: Awaited<ReturnType<typeof openDatabaseAsync>>;
    try {
      database = await openDatabaseAsync(databaseName);
    } catch (error) {
      console.warn("Synced rows stay in memory: no device storage.", error);
      return null;
    }
    let closing: Promise<void> | null = null;
    const close = () => {
      closing ??= (async () => {
        await database.closeAsync();
        // Only once it is closed: a deletion waits on this to finish first.
        openDatabases.delete(databaseName);
      })();
      return closing;
    };
    openDatabases.set(databaseName, close);
    return { persistence: createExpoSQLitePersistence({ database }), close };
  });
}

/** Closes and deletes the registered device databases that `match` selects. */
function deleteDatabases(match: (name: string) => boolean): Promise<void> {
  return serial(async () => {
    const registered = await registeredDatabases();
    const deleted = new Set<string>();
    for (const name of registered.filter(match)) {
      await openDatabases.get(name)?.();
      try {
        await deleteDatabaseAsync(name);
        deleted.add(name);
      } catch {
        // Kept in the registry, so a later deletion tries again.
      }
    }
    await writeRegistry(registered.filter((name) => !deleted.has(name)));
  });
}

/** Closes and deletes every device database of a User, for a sign-out. */
export async function deleteDeviceStorage(userId: string): Promise<void> {
  // Counted at once, so an open the provider asked for earlier is cancelled.
  deletions.set(userId, (deletions.get(userId) ?? 0) + 1);
  const prefix = await deviceDatabasePrefix(userId);
  await deleteDatabases((name) => name.startsWith(prefix));
}

/**
 * Deletes the device databases of every other User. The app holds one
 * signed-in User at a time, so another User's stored rows are only a copy of
 * server data that this User must not keep. Their Outbox stays: a session that
 * expires keeps its Pending Changes for that User's next sign-in.
 */
export async function deleteOtherUsersStorage(userId: string): Promise<void> {
  const prefix = await deviceDatabasePrefix(userId);
  await deleteDatabases((name) => !name.startsWith(prefix));
}
