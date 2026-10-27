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
        emailVerified: false,
        twoFactorEnabled: false
      }
    };

    setStoredSession(AUTH_DEFINITION.storageKey, session);
    expect(getStoredSession(AUTH_DEFINITION.storageKey)).toEqual(session);

    setStoredSession(AUTH_DEFINITION.storageKey, null);
    expect(getStoredSession(AUTH_DEFINITION.storageKey)).toBeNull();
  });

  it("never persists or returns a durable bearer token on web", async () => {
    const { AUTH_DEFINITION } = await import("./auth.definition");
    const { authHeaders, getStoredSessionToken, setStoredSessionToken } =
      await import("./auth.util");

    localStorageMap.set(AUTH_DEFINITION.tokenStorageKey, "legacy-token");
    setStoredSessionToken(AUTH_DEFINITION.tokenStorageKey, "token-abc");

    expect(getStoredSessionToken(AUTH_DEFINITION.tokenStorageKey)).toBeNull();
    expect(localStorageMap.has(AUTH_DEFINITION.tokenStorageKey)).toBe(false);
    expect(authHeaders(null)).toEqual({});
  });
});

describe("resolveReturnPath", () => {
  it.each([
    ["/invitations/inv-1", "/invitations/inv-1"],
    ["/notes/1?tab=a#b", "/notes/1?tab=a#b"],
    [null, "/dashboard"],
    ["", "/dashboard"],
    ["https://evil.example", "/dashboard"],
    ["//evil.example", "/dashboard"],
    ["/\\evil.example", "/dashboard"],
    ["javascript:alert(1)", "/dashboard"]
  ])("returns %j as %j", async (value, expected) => {
    const { resolveReturnPath } = await import("./auth.util");

    expect(resolveReturnPath(value)).toBe(expected);
  });
});

// The desktop app serves the web build from a Tauri origin that never matches
// the passkey relying party, so it hides passkeys even where WebAuthn exists.
describe("isPasskeySupported", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "PublicKeyCredential");
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it.each([
    { label: "a browser with WebAuthn", webAuthn: true, tauri: false, expected: true },
    { label: "a browser without WebAuthn", webAuthn: false, tauri: false, expected: false },
    { label: "the desktop app with WebAuthn", webAuthn: true, tauri: true, expected: false }
  ])("is $expected in $label", async ({ webAuthn, tauri, expected }) => {
    if (webAuthn) {
      Object.assign(window, { PublicKeyCredential: class PublicKeyCredential {} });
    }
    if (tauri) {
      Object.assign(window, { __TAURI_INTERNALS__: {} });
    }
    const { isPasskeySupported } = await import("./auth.util");

    expect(isPasskeySupported()).toBe(expected);
  });
});
