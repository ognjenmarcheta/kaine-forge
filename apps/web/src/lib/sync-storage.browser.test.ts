// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

// OPFS for this browser: its files, and whether the browser lets the page reach it.
const opfs = vi.hoisted(() => ({ files: new Set<string>(), reachable: true }));

vi.mock("@tanstack/browser-db-sqlite-persistence", () => ({
  BrowserCollectionCoordinator: class {
    dispose() {}
  },
  createBrowserWASQLitePersistence: () => ({}),
  openBrowserWASQLiteOPFSDatabase: async ({ databaseName }: { databaseName: string }) => {
    opfs.files.add(databaseName);
    return { close: async () => undefined };
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
