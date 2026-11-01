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
 * Opens the device database of one User in one Organization. Resolves null
 * when SQLite cannot open it; the synced rows then live in memory, as before.
 */
export async function openDeviceStorage(scope: {
  userId: string;
  organizationId: string;
}): Promise<{ persistence: DevicePersistence; close: () => Promise<void> } | null> {
  const databaseName = `${await deviceDatabasePrefix(scope.userId)}${await namePart(scope.organizationId)}.db`;
  let database: Awaited<ReturnType<typeof openDatabaseAsync>>;
  try {
    database = await openDatabaseAsync(databaseName);
    await writeRegistry([...(await registeredDatabases()), databaseName]);
  } catch (error) {
    console.warn("Synced rows stay in memory: no device storage.", error);
    return null;
  }
  let closing: Promise<void> | null = null;
  const close = () => {
    closing ??= (async () => {
      openDatabases.delete(databaseName);
      await database.closeAsync();
    })();
    return closing;
  };
  openDatabases.set(databaseName, close);
  return { persistence: createExpoSQLitePersistence({ database }), close };
}

/** Closes and deletes the registered device databases that `match` selects. */
async function deleteDatabases(match: (name: string) => boolean): Promise<void> {
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
}

/** Closes and deletes every device database of a User, for a sign-out. */
export async function deleteDeviceStorage(userId: string): Promise<void> {
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
