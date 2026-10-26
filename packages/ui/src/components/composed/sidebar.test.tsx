import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Sidebar, SidebarContent, SidebarProvider, SidebarRail, SidebarTrigger } from "./sidebar";

describe("sidebar", () => {
  it("supports controlled open state and renders collapsed data attributes", () => {
    const onOpenChange = vi.fn();
    const markup = renderToStaticMarkup(
      <SidebarProvider defaultOpen open={false} onOpenChange={onOpenChange}>
        <Sidebar>
          <SidebarContent />
        </Sidebar>
      </SidebarProvider>
    );

    expect(markup).toContain('data-slot="sidebar"');
    expect(markup).toContain('data-state="collapsed"');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("renders trigger and rail without legacy button classes", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <Sidebar>
          <SidebarTrigger />
          <SidebarRail />
        </Sidebar>
      </SidebarProvider>
    );

    expect(markup).toContain('data-slot="sidebar-trigger"');
    expect(markup).toContain('data-slot="sidebar-rail"');
    expect(markup).not.toContain("ui-button");
  });
});
