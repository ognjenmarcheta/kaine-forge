import { describe, expect, it, vi } from "vitest";

import { buildDesktopMenuTemplate } from "./menu.template";

describe("menu", () => {
  it("includes File, Navigate and View menus", () => {
    const template = buildDesktopMenuTemplate({
      onNavigate: vi.fn(),
      onReload: vi.fn(),
      onToggleDevTools: vi.fn()
    });

    expect(template.map((item) => item.label)).toEqual(["File", "Navigate", "View", "Window"]);
  });

  it("wires navigation callbacks", () => {
    const onNavigate = vi.fn();

    const template = buildDesktopMenuTemplate({
      onNavigate,
      onReload: vi.fn(),
      onToggleDevTools: vi.fn()
    });

    const navigateMenu = template.find((item) => item.label === "Navigate");

    if (!navigateMenu || !Array.isArray(navigateMenu.submenu)) {
      throw new Error("Navigate menu not found");
    }

    const dashboard = navigateMenu.submenu[0];
    const todos = navigateMenu.submenu[1];

    if (!dashboard || !todos) {
      throw new Error("Navigate submenu is incomplete");
    }

    if ("click" in dashboard && typeof dashboard.click === "function") {
      dashboard.click({} as never, {} as never, {} as never);
    }

    if ("click" in todos && typeof todos.click === "function") {
      todos.click({} as never, {} as never, {} as never);
    }

    expect(onNavigate).toHaveBeenCalledWith("dashboard");
    expect(onNavigate).toHaveBeenCalledWith("todos");
  });
});
