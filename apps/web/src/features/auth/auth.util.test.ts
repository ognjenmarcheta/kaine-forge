import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const localStorageMap = new Map<string, string>();

const localStorageStub: Storage = {
  getItem: (key: string) => localStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStorageMap.set(key, value);
  },
  removeItem: (key: string) => {
    localStorageMap.delete(key);
  },
  clear: () => {
    localStorageMap.clear();
  },
  get length() {
    return localStorageMap.size;
  },
  key: () => null
};

Object.defineProperty(globalThis, "window", {
  configurable: true,
  writable: true,
  value: { localStorage: localStorageStub }
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  writable: true,
  value: localStorageStub
});

beforeEach(() => {
  vi.resetModules();
  localStorageMap.clear();
});

afterEach(() => {
  localStorageMap.clear();
});

describe("auth.util session storage", () => {
  it("round-trips a stored session through get/set helpers", async () => {
    const { AUTH_DEFINITION } = await import("./auth.definition");
    const { getStoredSession, setStoredSession } = await import("./auth.util");

    const session = {
      expiresAt: new Date().toISOString(),
      activeOrganizationId: null,
      user: {
        id: "user_1",
        email: "a@example.com",
        name: "A",
        emailVerified: false
      }
    };

    setStoredSession(AUTH_DEFINITION.storageKey, session);
    expect(getStoredSession(AUTH_DEFINITION.storageKey)).toEqual(session);

    setStoredSession(AUTH_DEFINITION.storageKey, null);
    expect(getStoredSession(AUTH_DEFINITION.storageKey)).toBeNull();
  });

  it("builds bearer auth headers from the stored session token", async () => {
    const { AUTH_DEFINITION } = await import("./auth.definition");
    const { authHeaders, setStoredSessionToken } = await import("./auth.util");

    expect(authHeaders(null)).toEqual({});

    setStoredSessionToken(AUTH_DEFINITION.tokenStorageKey, "token-abc");
    expect(authHeaders(null)).toEqual({ authorization: "Bearer token-abc" });

    setStoredSessionToken(AUTH_DEFINITION.tokenStorageKey, null);
    expect(authHeaders(null)).toEqual({});
  });
});
