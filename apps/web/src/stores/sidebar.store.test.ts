import { afterEach, describe, expect, it, vi } from "vitest";

import { useSidebarStore } from "./sidebar.store";

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
  useSidebarStore.setState({ isCollapsed: false });
  Reflect.deleteProperty(globalThis, "window");
});

describe("sidebar.store", () => {
  it("toggles and persists collapse state", () => {
    const localStorage: LocalStorageStub = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn()
    };

    installWindowStub(localStorage);
    useSidebarStore.getState().toggleSidebar();

    expect(useSidebarStore.getState().isCollapsed).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith("kaine.sidebar.collapsed", "1");
  });
});
