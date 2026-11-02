// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

// The desktop shell's database commands: its database files, and each open it was asked for.
const shell = vi.hoisted(() => ({ files: new Set<string>(), opened: [] as string[] }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (command: string, args?: { name?: string }) => {
    const name = args?.name ?? "";
    if (command === "device_db_open") {
      shell.files.add(name);
      shell.opened.push(name);
    }
    if (command === "device_db_delete") shell.files.delete(name);
    if (command === "device_db_list") return [...shell.files];
    return undefined;
  }
}));
vi.mock("@tanstack/tauri-db-sqlite-persistence", () => ({
  createTauriSQLitePersistence: () => ({})
}));
vi.mock("@tanstack/browser-db-sqlite-persistence", () => ({}));

Object.assign(window, { __TAURI_INTERNALS__: {} });
const { deleteDeviceStorage, openDeviceStorage } = await import("./sync-storage");

// SHA-256 name parts: "u1", "u2", and "o1".
const U1_O1 = "ks-bb82030dbc2bcaba-2352da7280f1decc.db";
const U2_O1 = "ks-6ca202c88e549dff-2352da7280f1decc.db";
const signal = new AbortController().signal;

beforeEach(() => {
  shell.files.clear();
  shell.opened = [];
});

it("deletes only the signed-out User's databases in the desktop shell", async () => {
  await openDeviceStorage({ userId: "u1", organizationId: "o1" }, signal);
  await openDeviceStorage({ userId: "u2", organizationId: "o1" }, signal);

  await deleteDeviceStorage("u1");

  expect([...shell.files]).toEqual([U2_O1]);
});

it("opens a database again after a sign-out deleted it, instead of reusing the closed one", async () => {
  await openDeviceStorage({ userId: "u1", organizationId: "o1" }, signal);
  await deleteDeviceStorage("u1");

  await openDeviceStorage({ userId: "u1", organizationId: "o1" }, signal);

  expect(shell.opened).toEqual([U1_O1, U1_O1]);
});
