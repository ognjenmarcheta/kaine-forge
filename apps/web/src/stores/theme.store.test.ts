import { afterEach, describe, expect, it, vi } from "vitest";

import { useThemeStore } from "./theme.store";

type LocalStorageStub = {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};

function installWindowStub(localStorage: LocalStorageStub) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage
    }
  });
}

afterEach(() => {
  useThemeStore.setState({ themeMode: "system" });
  Reflect.deleteProperty(globalThis, "window");
});

describe("theme.store", () => {
  it("persists theme mode to localStorage", () => {
    const localStorage: LocalStorageStub = {
      getItem: vi.fn().mockReturnValue("system"),
      setItem: vi.fn()
    };

    installWindowStub(localStorage);
    useThemeStore.getState().setThemeMode("dark");

    expect(useThemeStore.getState().themeMode).toBe("dark");
    expect(localStorage.setItem).toHaveBeenCalledWith("kaine.theme.mode", "dark");
  });

  it("accepts and persists high-contrast theme modes", () => {
    const localStorage: LocalStorageStub = {
      getItem: vi.fn().mockReturnValue("system"),
      setItem: vi.fn()
    };

    installWindowStub(localStorage);
    useThemeStore.getState().setThemeMode("light-high-contrast");

    expect(useThemeStore.getState().themeMode).toBe("light-high-contrast");
    expect(localStorage.setItem).toHaveBeenCalledWith("kaine.theme.mode", "light-high-contrast");
  });

  it("hydrates high-contrast theme mode from localStorage", async () => {
    const localStorage: LocalStorageStub = {
      getItem: vi.fn().mockReturnValue("dark-high-contrast"),
      setItem: vi.fn()
    };

    installWindowStub(localStorage);
    vi.resetModules();
    const { useThemeStore: reloadedThemeStore } = await import("./theme.store");

    expect(reloadedThemeStore.getState().themeMode).toBe("dark-high-contrast");
  });
});
