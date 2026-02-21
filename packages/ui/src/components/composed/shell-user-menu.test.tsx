import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShellUserMenu, resolveUserInitials } from "./shell-user-menu";
import { SidebarProvider } from "../primitives/sidebar";

describe("shell-user-menu", () => {
  it("resolves display name initials", () => {
    expect(resolveUserInitials("Ada Lovelace")).toBe("AL");
    expect(resolveUserInitials("Ada")).toBe("A");
    expect(resolveUserInitials("")).toBe("U");
  });

  it("renders trigger with avatar fallback and name", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <ShellUserMenu
          displayName="Ada Lovelace"
          email="ada@example.com"
          logoutLabel="Log out"
          onLogout={() => {}}
        />
      </SidebarProvider>
    );

    expect(markup).toContain("Ada Lovelace");
    expect(markup).toContain("ada@example.com");
    expect(markup).toContain("AL");
    expect(markup).toContain('data-slot="dropdown-menu-trigger"');
  });
});
