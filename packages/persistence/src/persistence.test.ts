import { describe, expect, it } from "vitest";

import {
  createAsyncStoragePersistenceAdapter,
  createMemoryPersistenceAdapter,
  createSyncStoragePersistenceAdapter,
  getJsonValueSync,
  getJsonValue,
  setJsonValueSync,
  setJsonValue
} from "./persistence";

describe("persistence adapters", () => {
  it("stores string and JSON values in memory", async () => {
    const adapter = createMemoryPersistenceAdapter();

    await adapter.setString("session-token", "token-1");
    await setJsonValue(adapter, "session", { userId: "user-1" });

    await expect(adapter.getString("session-token")).resolves.toBe("token-1");
    await expect(getJsonValue<{ userId: string }>(adapter, "session")).resolves.toEqual({
      userId: "user-1"
    });

    await adapter.remove("session-token");

    await expect(adapter.getString("session-token")).resolves.toBeNull();
  });

  it("wraps synchronous key-value storage", async () => {
    const values = new Map<string, string>();
    const adapter = createSyncStoragePersistenceAdapter(() => ({
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => {
        values.delete(key);
      },
      setItem: (key, value) => {
        values.set(key, value);
      }
    }));

    await adapter.setString("language", "en");

    expect(values.get("language")).toBe("en");
    await expect(adapter.getString("language")).resolves.toBe("en");

    setJsonValueSync(
      {
        getItem: (key) => values.get(key) ?? null,
        removeItem: (key) => {
          values.delete(key);
        },
        setItem: (key, value) => {
          values.set(key, value);
        }
      },
      "json",
      { enabled: true }
    );
    expect(
      getJsonValueSync<{ enabled: boolean }>(
        {
          getItem: (key) => values.get(key) ?? null,
          removeItem: (key) => {
            values.delete(key);
          },
          setItem: (key, value) => {
            values.set(key, value);
          }
        },
        "json"
      )
    ).toEqual({ enabled: true });
  });

  it("wraps async key-value storage", async () => {
    const values = new Map<string, string>();
    const adapter = createAsyncStoragePersistenceAdapter({
      getItem: async (key) => values.get(key) ?? null,
      removeItem: async (key) => {
        values.delete(key);
      },
      setItem: async (key, value) => {
        values.set(key, value);
      }
    });

    await adapter.setString("theme", "dark");

    await expect(adapter.getString("theme")).resolves.toBe("dark");
  });

  it("returns null for invalid JSON", async () => {
    const adapter = createMemoryPersistenceAdapter([["bad", "{"]]);

    await expect(getJsonValue(adapter, "bad")).resolves.toBeNull();
  });
});
