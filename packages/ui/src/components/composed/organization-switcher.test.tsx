import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OrganizationSwitcher } from "./organization-switcher";
import { SidebarProvider } from "../primitives/sidebar";

describe("organization-switcher", () => {
  it("renders selected organization and dropdown trigger", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <OrganizationSwitcher
          label="Organization"
          onValueChange={() => {}}
          organizations={[
            { name: "Acme Inc", value: "org-1" },
            { name: "Acme Corp", value: "org-2" }
          ]}
          value="org-1"
        />
      </SidebarProvider>
    );

    expect(markup).toContain("Acme Inc");
    expect(markup).toContain("Organization");
    expect(markup).toContain('data-slot="dropdown-menu-trigger"');
  });
});
