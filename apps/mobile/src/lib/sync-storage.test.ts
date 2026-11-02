import { beforeEach, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());
const sqlite = vi.hoisted(() => ({
  closed: [] as string[],
  deleted: [] as string[],
  events: [] as string[],
  closeDelay: 0,
  locked: new Set<string>()
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => void store.set(key, value)
  }
}));
// A readable stand-in digest: the device names then show which ids they came from.
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_algorithm: string, id: string) => `${id}`.padEnd(16, "0")
}));
vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: async (name: string) => ({
    closeAsync: async () => {
      await new Promise((resolve) => setTimeout(resolve, sqlite.closeDelay));
      sqlite.closed.push(name);
      sqlite.events.push(`closed ${name}`);
    }
  }),
  deleteDatabaseAsync: async (name: string) => {
    if (sqlite.locked.has(name)) throw new Error("database is locked");
    sqlite.deleted.push(name);
    sqlite.events.push(`deleted ${name}`);
  }
}));
vi.mock("@tanstack/expo-db-sqlite-persistence", () => ({
  createExpoSQLitePersistence: () => ({})
}));

const { deleteDeviceStorage, deleteOtherUsersStorage, openDeviceStorage } =
  await import("./sync-storage");

beforeEach(() => {
  store.clear();
  sqlite.closed = [];
  sqlite.deleted = [];
  sqlite.events = [];
  sqlite.closeDelay = 0;
  sqlite.locked.clear();
});

const registry = () => JSON.parse(store.get("kaine-sync:databases") ?? "[]");

it("deletes only the signed-out User's databases, closing the open one first", async () => {
  await openDeviceStorage({ userId: "u1", organizationId: "o1" });
  const otherOrganization = await openDeviceStorage({ userId: "u1", organizationId: "o2" });
  await otherOrganization?.close();
  await openDeviceStorage({ userId: "u2", organizationId: "o1" });
  sqlite.closed = [];

  await deleteDeviceStorage("u1");

  expect(sqlite.closed).toEqual(["ks-u100000000000000-o100000000000000.db"]);
  expect(sqlite.deleted).toEqual([
    "ks-u100000000000000-o100000000000000.db",
    "ks-u100000000000000-o200000000000000.db"
  ]);
  expect(JSON.parse(store.get("kaine-sync:databases") ?? "[]")).toEqual([
    "ks-u200000000000000-o100000000000000.db"
  ]);
});

it("reports a database it could not delete and keeps it listed for the next try", async () => {
  await openDeviceStorage({ userId: "u1", organizationId: "o1" });
  sqlite.locked.add("ks-u100000000000000-o100000000000000.db");

  await expect(deleteDeviceStorage("u1")).resolves.toBe(false);
  expect(registry()).toEqual(["ks-u100000000000000-o100000000000000.db"]);

  sqlite.locked.clear();
  await expect(deleteDeviceStorage("u1")).resolves.toBe(true);
  expect(registry()).toEqual([]);
});

it("deletes every other User's databases when a User starts sync", async () => {
  await openDeviceStorage({ userId: "u1", organizationId: "o1" });
  await openDeviceStorage({ userId: "u2", organizationId: "o1" });

  await deleteOtherUsersStorage("u2");

  expect(sqlite.deleted).toEqual(["ks-u100000000000000-o100000000000000.db"]);
  expect(JSON.parse(store.get("kaine-sync:databases") ?? "[]")).toEqual([
    "ks-u200000000000000-o100000000000000.db"
  ]);
});

it("lists every database when two Organizations open at once", async () => {
  await Promise.all([
    openDeviceStorage({ userId: "u1", organizationId: "o1" }),
    openDeviceStorage({ userId: "u1", organizationId: "o2" })
  ]);

  expect(registry()).toEqual([
    "ks-u100000000000000-o100000000000000.db",
    "ks-u100000000000000-o200000000000000.db"
  ]);
});

it("leaves no database behind when the User signs out while it opens", async () => {
  const opening = openDeviceStorage({ userId: "u1", organizationId: "o1" });
  await deleteDeviceStorage("u1");

  expect(await opening).toBeNull();
  expect(registry()).toEqual([]);
  // A later sign-in opens again.
  expect(await openDeviceStorage({ userId: "u1", organizationId: "o1" })).not.toBeNull();
});

it("deletes a database only after a close already under way finishes", async () => {
  const device = await openDeviceStorage({ userId: "u1", organizationId: "o1" });
  sqlite.closeDelay = 20;
  void device?.close();

  await deleteDeviceStorage("u1");

  expect(sqlite.events).toEqual([
    "closed ks-u100000000000000-o100000000000000.db",
    "deleted ks-u100000000000000-o100000000000000.db"
  ]);
});

it("still opens when the database list on the device cannot be read", async () => {
  store.set("kaine-sync:databases", "{not json");

  expect(await openDeviceStorage({ userId: "u1", organizationId: "o1" })).not.toBeNull();
  expect(registry()).toEqual(["ks-u100000000000000-o100000000000000.db"]);
});
