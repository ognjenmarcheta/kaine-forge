import { beforeEach, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());
const sqlite = vi.hoisted(() => ({ closed: [] as string[], deleted: [] as string[] }));

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
    closeAsync: async () => void sqlite.closed.push(name)
  }),
  deleteDatabaseAsync: async (name: string) => void sqlite.deleted.push(name)
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
});

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

it("deletes every other User's databases when a User starts sync", async () => {
  await openDeviceStorage({ userId: "u1", organizationId: "o1" });
  await openDeviceStorage({ userId: "u2", organizationId: "o1" });

  await deleteOtherUsersStorage("u2");

  expect(sqlite.deleted).toEqual(["ks-u100000000000000-o100000000000000.db"]);
  expect(JSON.parse(store.get("kaine-sync:databases") ?? "[]")).toEqual([
    "ks-u200000000000000-o100000000000000.db"
  ]);
});
