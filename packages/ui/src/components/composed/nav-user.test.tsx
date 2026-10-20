import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NavUser, resolveNavUserInitials } from "./nav-user";
import { SidebarProvider } from "../primitives/sidebar";

/** The sidebar trigger's opening tag, where an aria-label would replace the visible text. */
const triggerTag = (markup: string): string =>
  /<button[^>]*data-sidebar="menu-button"[^>]*>/.exec(markup)?.[0] ?? "";

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
    // WCAG 2.5.3: the name comes from the visible text, not a replacing aria-label (#545).
    expect(triggerTag(markup)).not.toContain("aria-label=");
  });
});
