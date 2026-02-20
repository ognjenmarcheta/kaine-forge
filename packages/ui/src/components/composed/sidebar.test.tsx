import { describe, expect, it } from "vitest";

import {
  resolveSidebarClassName,
  resolveSidebarMenuButtonClassName,
  resolveSidebarOpenFromStorage
} from "./sidebar";

describe("sidebar", () => {
  it("prefers persisted open state when storage value is valid", () => {
    expect(resolveSidebarOpenFromStorage({ defaultOpen: false, storageValue: "1" })).toBe(true);
    expect(resolveSidebarOpenFromStorage({ defaultOpen: true, storageValue: "0" })).toBe(false);
  });

  it("falls back to default open state when storage value is missing or invalid", () => {
    expect(resolveSidebarOpenFromStorage({ defaultOpen: true, storageValue: null })).toBe(true);
    expect(resolveSidebarOpenFromStorage({ defaultOpen: false, storageValue: null })).toBe(false);
    expect(resolveSidebarOpenFromStorage({ defaultOpen: true, storageValue: "invalid" })).toBe(
      true
    );
  });

  it("returns collapsed class names when sidebar is closed", () => {
    const className = resolveSidebarClassName(false);

    expect(className).toContain("ui-sidebar");
    expect(className).toContain("ui-sidebar--collapsed");
  });

  it("returns active menu button class names for active items", () => {
    const className = resolveSidebarMenuButtonClassName({ isActive: true });

    expect(className).toContain("ui-sidebar__menu-button");
    expect(className).toContain("ui-sidebar__menu-button--active");
  });
});
