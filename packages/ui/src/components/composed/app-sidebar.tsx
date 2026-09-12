import type * as React from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail
} from "../primitives/sidebar";

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  mobileSheetCloseLabel?: string;
  mobileSheetDescription?: string;
  mobileSheetTitle?: string;
  navMain: React.ReactNode;
  navPreferences?: React.ReactNode;
  railLabel?: string;
  triggerLabel?: string;
  organizationSwitcher?: React.ReactNode;
  user?: React.ReactNode;
}

export function AppSidebar({
  collapsible = "icon",
  mobileSheetCloseLabel,
  mobileSheetDescription,
  mobileSheetTitle,
  navMain,
  navPreferences,
  railLabel,
  organizationSwitcher,
  triggerLabel,
  user,
  ...props
}: AppSidebarProps) {
  const resolvedRailLabel = railLabel ?? triggerLabel;

  return (
    <Sidebar
      collapsible={collapsible}
      {...(mobileSheetCloseLabel ? { mobileSheetCloseLabel } : {})}
      {...(mobileSheetDescription ? { mobileSheetDescription } : {})}
      {...(mobileSheetTitle ? { mobileSheetTitle } : {})}
      {...props}
    >
      <SidebarHeader>{organizationSwitcher}</SidebarHeader>
      <SidebarContent>{navMain}</SidebarContent>
      <SidebarFooter>
        {navPreferences}
        {user ? <div className="ui-sidebar-user">{user}</div> : null}
      </SidebarFooter>
      <SidebarRail {...(resolvedRailLabel ? { label: resolvedRailLabel } : {})} />
    </Sidebar>
  );
}
