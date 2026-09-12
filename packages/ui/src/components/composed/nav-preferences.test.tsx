import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NavPreferences } from "./nav-preferences";
import { SidebarProvider } from "../primitives/sidebar";

describe("nav-preferences", () => {
  it("renders preferences group with language and theme controls", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <NavPreferences
          groupLabel="Settings"
          language={{
            label: "Language",
            onValueChange: () => {},
            options: [{ label: "EN", value: "en" }],
            value: "en"
          }}
          theme={{
            label: "Theme",
            onValueChange: () => {},
            options: [{ label: "Light", value: "light" }],
            value: "light"
          }}
        />
      </SidebarProvider>
    );

    expect(markup).toContain("Settings");
    expect(markup).toContain("Language");
    expect(markup).toContain("Theme");
  });

  it("renders compact icon row when inline-icons layout is used", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <NavPreferences
          layout="inline-icons"
          language={{
            label: "Language",
            onValueChange: () => {},
            options: [{ label: "EN", value: "en" }],
            value: "en"
          }}
          theme={{
            label: "Theme",
            onValueChange: () => {},
            options: [{ label: "Light", value: "light" }],
            value: "light"
          }}
        />
      </SidebarProvider>
    );

    expect(markup).toContain("ui-sidebar-preferences");
    expect(markup.match(/data-slot="tooltip-trigger"/g)?.length).toBe(2);
    expect(markup.match(/data-sidebar="menu-button"/g)?.length).toBe(2);
  });
});
