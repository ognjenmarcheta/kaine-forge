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
});
