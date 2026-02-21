import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger
} from "./sidebar";

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

  it("renders slot attributes for menu actions, badges and sub-menu API", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarGroupAction aria-label="Add">+</SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive>Projects</SidebarMenuButton>
                    <SidebarMenuAction aria-label="More">...</SidebarMenuAction>
                    <SidebarMenuBadge>3</SidebarMenuBadge>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton href="/docs">Docs</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );

    expect(markup).toContain('data-slot="sidebar-group-action"');
    expect(markup).toContain('data-slot="sidebar-menu-action"');
    expect(markup).toContain('data-slot="sidebar-menu-badge"');
    expect(markup).toContain('data-slot="sidebar-menu-sub"');
    expect(markup).toContain('data-slot="sidebar-menu-sub-button"');
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
