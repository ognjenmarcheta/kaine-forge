import { LogOut, MoreVertical } from "lucide-react";

import { cn } from "../../lib/cn";
import { Avatar, AvatarFallback } from "../primitives/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../primitives/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../primitives/sidebar";

export interface ShellUserMenuProps {
  ariaLabel?: string;
  className?: string;
  displayName: string;
  email: string;
  logoutLabel: string;
  onLogout: () => void;
}

export function resolveUserInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return "U";
  }

  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const second = parts[1]?.charAt(0) ?? "";
  return `${first}${second || ""}`.toUpperCase();
}

export function ShellUserMenu({
  ariaLabel,
  className,
  displayName,
  email,
  logoutLabel,
  onLogout
}: ShellUserMenuProps) {
  const initials = resolveUserInitials(displayName);

  return (
    <SidebarMenu className="w-full">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              aria-label={ariaLabel ?? displayName}
              className={cn(
                "data-[state=open]:bg-[var(--ds-background-neutral-hovered)] data-[state=open]:text-[color:var(--ds-text)]",
                className
              )}
              size="lg"
            >
              <Avatar size="sm">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 min-w-0 text-left leading-tight">
                <span className="truncate text-body font-medium text-[color:var(--ds-text)]">
                  {displayName}
                </span>
                <span className="truncate text-body-xs text-[color:var(--ds-text-subtle)]">
                  {email}
                </span>
              </div>
              <MoreVertical
                aria-hidden
                className="ml-auto size-4 text-[color:var(--ds-icon-subtle)]"
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-[12rem]"
          >
            <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
            <DropdownMenuLabel className="truncate font-normal text-[color:var(--ds-text-subtle)]">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onLogout}>
              <LogOut aria-hidden className="size-4" />
              {logoutLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
