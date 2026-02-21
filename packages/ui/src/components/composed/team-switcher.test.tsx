import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TeamSwitcher } from "./team-switcher";
import { SidebarProvider } from "../primitives/sidebar";

describe("team-switcher", () => {
  it("renders selected team and dropdown trigger", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <TeamSwitcher
          label="Organization"
          onValueChange={() => {}}
          teams={[
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
