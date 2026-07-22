import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "../primitives/sidebar";

describe("app-sidebar", () => {
  it("renders header, content, footer, and rail sections", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <AppSidebar
          navMain={<div>Main</div>}
          navPreferences={<div>Preferences</div>}
          organizationSwitcher={<div>Organization</div>}
          user={<div>User</div>}
        />
      </SidebarProvider>
    );

    expect(markup).toContain("Organization");
    expect(markup).toContain("Main");
    expect(markup).toContain("Preferences");
    expect(markup).toContain("User");
    expect(markup.indexOf("Preferences")).toBeLessThan(markup.indexOf("User"));
    expect(markup).toContain('data-slot="sidebar-rail"');
  });
});
