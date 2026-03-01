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

// Zustand persist defaults to window.localStorage — stub both window and localStorage
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

describe("theme.store", () => {
  it("persists theme mode to localStorage via persist middleware", async () => {
    const { useThemeStore } = await import("./theme.store");

    useThemeStore.getState().setThemeMode("dark");

    expect(useThemeStore.getState().themeMode).toBe("dark");

    const stored = localStorageMap.get("kaine.theme.mode");
    expect(stored).toBeDefined();
    expect(stored).toContain('"themeMode":"dark"');
  });
});
