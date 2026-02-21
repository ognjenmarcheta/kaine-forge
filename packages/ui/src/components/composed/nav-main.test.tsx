import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NavMain } from "./nav-main";
import { SidebarProvider } from "../primitives/sidebar";

describe("nav-main", () => {
  it("renders navigation group and menu items", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <NavMain
          groupLabel="Main"
          items={[
            { href: "/dashboard", title: "Dashboard" },
            { href: "/todos", title: "Todos" }
          ]}
        />
      </SidebarProvider>
    );

    expect(markup).toContain("Main");
    expect(markup).toContain("Dashboard");
    expect(markup).toContain("Todos");
    expect(markup).toContain('data-sidebar="menu-button"');
  });
});
