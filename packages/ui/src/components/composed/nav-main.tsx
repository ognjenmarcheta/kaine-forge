import { type LucideIcon } from "lucide-react";
import * as React from "react";

import {
  useSidebar,
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
  const { setOpenMobile } = useSidebar();
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
                <SidebarMenuButton
                  onClick={(event) => {
                    if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey)
                      setOpenMobile(false);
                  }}
                  asChild
                  tooltip={item.title}
                  {...(item.isActive !== undefined ? { isActive: item.isActive } : {})}
                >
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
