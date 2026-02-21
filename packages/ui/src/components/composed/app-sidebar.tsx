import type * as React from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail
} from "../primitives/sidebar";

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  navMain: React.ReactNode;
  navPreferences?: React.ReactNode;
  teamSwitcher?: React.ReactNode;
  user?: React.ReactNode;
}

export function AppSidebar({
  collapsible = "icon",
  navMain,
  navPreferences,
  teamSwitcher,
  user,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar collapsible={collapsible} {...props}>
      <SidebarHeader>{teamSwitcher}</SidebarHeader>
      <SidebarContent>{navMain}</SidebarContent>
      <SidebarFooter>
        {navPreferences}
        {user}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
