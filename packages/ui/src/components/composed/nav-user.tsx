import { LogOut, MoreVertical } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "../primitives/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../primitives/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "../primitives/sidebar";

export interface NavUserData {
  avatar?: string;
  email: string;
  name: string;
}

export interface NavUserProps {
  ariaLabel?: string;
  className?: string;
  logoutLabel: string;
  onLogout: () => void;
  user: NavUserData;
}

export function resolveNavUserInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return "U";
  }

  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const second = parts[1]?.charAt(0) ?? "";
  return `${first}${second || ""}`.toUpperCase();
}

export function NavUser({ ariaLabel, className, logoutLabel, onLogout, user }: NavUserProps) {
  const { isMobile } = useSidebar();
  const initials = resolveNavUserInitials(user.name);

  return (
    <SidebarMenu className="w-full">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton aria-label={ariaLabel ?? user.name} className={className} size="lg">
              <Avatar className="h-8 w-8 rounded-lg">
                {user.avatar ? <AvatarImage alt={user.name} src={user.avatar} /> : null}
                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 min-w-0 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-[color:var(--ds-text-subtle)]">
                  {user.email}
                </span>
              </div>
              <MoreVertical aria-hidden className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  {user.avatar ? <AvatarImage alt={user.name} src={user.avatar} /> : null}
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 min-w-0 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-[color:var(--ds-text-subtle)]">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onLogout}>
              <LogOut />
              {logoutLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
