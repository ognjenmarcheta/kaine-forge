import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OrganizationSwitcher } from "./organization-switcher";
import { SidebarProvider } from "../primitives/sidebar";

/** The sidebar trigger's opening tag, where an aria-label would replace the visible text. */
const triggerTag = (markup: string): string =>
  /<button[^>]*data-sidebar="menu-button"[^>]*>/.exec(markup)?.[0] ?? "";

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
    // WCAG 2.5.3: the name comes from the visible text, not a replacing aria-label (#545).
    expect(triggerTag(markup)).not.toContain("aria-label=");
  });
});
