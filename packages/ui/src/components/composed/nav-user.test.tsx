import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NavUser, resolveNavUserInitials } from "./nav-user";
import { SidebarProvider } from "../primitives/sidebar";

describe("nav-user", () => {
  it("resolves initials for user name", () => {
    expect(resolveNavUserInitials("Ada Lovelace")).toBe("AL");
    expect(resolveNavUserInitials("Ada")).toBe("A");
  });

  it("renders user identity in the sidebar trigger", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <NavUser
          logoutLabel="Log out"
          onLogout={() => {}}
          user={{ email: "ada@example.com", name: "Ada Lovelace" }}
        />
      </SidebarProvider>
    );

    expect(markup).toContain("Ada Lovelace");
    expect(markup).toContain("ada@example.com");
    expect(markup).toContain('data-slot="dropdown-menu-trigger"');
  });
});
