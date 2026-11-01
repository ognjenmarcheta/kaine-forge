import { beforeEach, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());
const network = vi.hoisted(() => ({
  listener: null as
    null | ((state: { isConnected: boolean; isInternetReachable: boolean | null }) => void)
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => void store.set(key, value),
    removeItem: async (key: string) => void store.delete(key),
    getAllKeys: async () => [...store.keys()],
    multiRemove: async (keys: string[]) => {
      for (const key of keys) store.delete(key);
    }
  }
}));
vi.mock("expo-network", () => ({
  addNetworkStateListener: (
    listener: (state: { isConnected: boolean; isInternetReachable: boolean | null }) => void
  ) => {
    network.listener = listener;
    return { remove: () => undefined };
  },
  getNetworkStateAsync: () => new Promise(() => undefined)
}));

const { createAsyncStorageOutbox, createExpoNetworkDetector, userOutboxKeys } =
  await import("./sync-stores");

beforeEach(() => {
  store.clear();
});

it("keeps each User and Organization's Outbox apart, and clears only its own", async () => {
  const mine = createAsyncStorageOutbox({ userId: "u1", organizationId: "o1" });
  const otherOrganization = createAsyncStorageOutbox({ userId: "u1", organizationId: "o2" });
  const otherUser = createAsyncStorageOutbox({ userId: "u2", organizationId: "o1" });
  await mine.set("tx:1", "a");
  await otherOrganization.set("tx:1", "b");
  await otherUser.set("tx:1", "c");

  expect(await mine.get("tx:1")).toBe("a");
  expect(await mine.keys()).toEqual(["tx:1"]);
  await mine.clear();

  expect(await mine.keys()).toEqual([]);
  expect(await otherOrganization.get("tx:1")).toBe("b");
  expect(await otherUser.get("tx:1")).toBe("c");
});

it("finds every Outbox key of one User, in any Organization, for a sign-out", async () => {
  await createAsyncStorageOutbox({ userId: "u1", organizationId: "o1" }).set("tx:1", "a");
  await createAsyncStorageOutbox({ userId: "u1", organizationId: "o2" }).set("tx:2", "b");
  await createAsyncStorageOutbox({ userId: "u2", organizationId: "o1" }).set("tx:3", "c");
  store.set("kaine.organization.active", "o1");

  expect((await userOutboxKeys("u1")).sort()).toEqual([
    "kaine-sync:u1:o1:tx:1",
    "kaine-sync:u1:o2:tx:2"
  ]);
});

it("reports offline when the device has no connection or no internet", () => {
  const detector = createExpoNetworkDetector();
  const changes: boolean[] = [];
  detector.subscribe(() => changes.push(detector.isOnline()));

  network.listener?.({ isConnected: true, isInternetReachable: false });
  network.listener?.({ isConnected: false, isInternetReachable: null });
  // Unknown reachability counts as online: a failed request says otherwise.
  network.listener?.({ isConnected: true, isInternetReachable: null });

  expect(changes).toEqual([false, false, true]);
  detector.dispose();
});
