// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

interface Database {
  execute: (sql: string) => Promise<ReadonlyArray<unknown>>;
}

// OPFS for this browser: its files, whether the browser lets the page reach it,
// how many statements another tab's lock still turns away, and what each
// statement reached the file.
const opfs = vi.hoisted(() => ({
  files: new Set<string>(),
  reachable: true,
  busyFor: 0,
  ran: [] as string[],
  database: null as Database | null
}));

vi.mock("@tanstack/browser-db-sqlite-persistence", () => ({
  BrowserCollectionCoordinator: class {
    dispose() {}
  },
  createBrowserWASQLitePersistence: ({ database }: { database: Database }) => {
    opfs.database = database;
    return {};
  },
  openBrowserWASQLiteOPFSDatabase: async ({ databaseName }: { databaseName: string }) => {
    opfs.files.add(databaseName);
    return {
      execute: async (sql: string) => {
        opfs.ran.push(sql);
        if (opfs.busyFor > 0) {
          opfs.busyFor -= 1;
          throw new Error("database is locked");
        }
        return [{ sql }];
      },
      close: async () => undefined
    };
  }
}));

Object.defineProperty(navigator, "storage", {
  configurable: true,
  value: {
    getDirectory: async () => {
      if (!opfs.reachable) throw new DOMException("storage is not available", "SecurityError");
      return {
        keys: async function* () {
          yield* [...opfs.files];
        },
        removeEntry: async (name: string) => void opfs.files.delete(name)
      };
    }
  }
});

const { deleteDeviceStorage, openDeviceStorage } = await import("./sync-storage");
const signal = new AbortController().signal;

beforeEach(() => {
  localStorage.clear();
  opfs.files.clear();
  opfs.reachable = true;
  opfs.busyFor = 0;
  opfs.ran = [];
  opfs.database = null;
});

it("reports a failed deletion when OPFS fails in a browser that stored a database", async () => {
  await openDeviceStorage({ userId: "u1", organizationId: "o1" }, signal);
  opfs.reachable = false;

  await expect(deleteDeviceStorage("u1")).resolves.toBe(false);
});

it("reports nothing to delete when OPFS was never reachable here", async () => {
  opfs.reachable = false;

  await expect(deleteDeviceStorage("u1")).resolves.toBe(true);
});

async function openedDatabase(): Promise<Database> {
  await openDeviceStorage({ userId: "u1", organizationId: "o1" }, signal);
  if (!opfs.database) throw new Error("no database reached the persistence");
  return opfs.database;
}

it("runs a statement again while another tab holds the database file", async () => {
  const database = await openedDatabase();
  opfs.busyFor = 2;

  await expect(database.execute("SELECT 1")).resolves.toEqual([{ sql: "SELECT 1" }]);
  expect(opfs.ran).toEqual(["SELECT 1", "SELECT 1", "SELECT 1"]);
});

it("does not run a busy statement again inside a transaction, so the transaction rolls back", async () => {
  const database = await openedDatabase();
  await database.execute("BEGIN IMMEDIATE");
  opfs.busyFor = 1;

  await expect(database.execute("INSERT INTO t VALUES (1)")).rejects.toThrow("database is locked");
  await database.execute("ROLLBACK");
  opfs.busyFor = 1;

  await expect(database.execute("SELECT 1")).resolves.toEqual([{ sql: "SELECT 1" }]);
  expect(opfs.ran).toEqual([
    "BEGIN IMMEDIATE",
    "INSERT INTO t VALUES (1)",
    "ROLLBACK",
    "SELECT 1",
    "SELECT 1"
  ]);
});
