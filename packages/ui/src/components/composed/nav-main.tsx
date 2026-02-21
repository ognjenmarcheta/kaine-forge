import { type LucideIcon } from "lucide-react";
import * as React from "react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "../primitives/sidebar";

export interface NavMainItem {
  href?: string;
  icon?: LucideIcon;
  isActive?: boolean;
  title: string;
}

export interface NavMainProps {
  groupLabel: string;
  items: NavMainItem[];
  renderLink?: (item: NavMainItem, content: React.ReactNode) => React.ReactElement;
}

export function NavMain({ groupLabel, items, renderLink }: NavMainProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const content = (
              <>
                {item.icon ? <item.icon /> : null}
                <span>{item.title}</span>
              </>
            );

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={item.isActive} tooltip={item.title}>
                  {renderLink ? (
                    renderLink(item, content)
                  ) : (
                    <a href={item.href ?? "#"}>{content}</a>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
