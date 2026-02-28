import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../primitives/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "../primitives/sidebar";

export interface TeamSwitcherItem {
  disabled?: boolean;
  icon?: React.ElementType;
  name: string;
  subtitle?: string;
  value: string;
}

export interface TeamSwitcherActionItem {
  label: string;
  onSelect: () => void;
}

export interface TeamSwitcherProps {
  actionItem?: TeamSwitcherActionItem;
  ariaLabel?: string;
  className?: string;
  label: string;
  onValueChange: (value: string) => void;
  teams: TeamSwitcherItem[];
  value?: string;
}

export function TeamSwitcher({
  actionItem,
  ariaLabel,
  className,
  label,
  onValueChange,
  teams,
  value
}: TeamSwitcherProps) {
  const { isMobile } = useSidebar();
  const activeTeam = teams.find((team) => team.value === value) ?? teams[0];

  if (!activeTeam) {
    return null;
  }

  const ActiveIcon = activeTeam.icon ?? Building2;

  return (
    <SidebarMenu className="w-full">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton aria-label={ariaLabel ?? label} className={className} size="lg">
              <div className="bg-[var(--ds-background-brand-bold)] text-[color:var(--ds-text-inverse)] flex aspect-square size-8 items-center justify-center rounded-lg">
                <ActiveIcon className="size-4" />
              </div>
              <div className="grid flex-1 min-w-0 text-left leading-tight">
                <span className="truncate font-medium">{activeTeam.name}</span>
                <span className="truncate text-xs text-[color:var(--ds-text-subtle)]">
                  {activeTeam.subtitle ?? label}
                </span>
              </div>
              <ChevronsUpDown aria-hidden className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-body-xs text-[color:var(--ds-text-subtle)]">
              {label}
            </DropdownMenuLabel>
            {teams.map((team) => {
              const TeamIcon = team.icon ?? Building2;
              const isActive = team.value === activeTeam.value;

              return (
                <DropdownMenuItem
                  key={team.value}
                  {...(team.disabled !== undefined ? { disabled: team.disabled } : {})}
                  onSelect={() => {
                    if (!team.disabled) {
                      onValueChange(team.value);
                    }
                  }}
                >
                  <div className="flex size-6 items-center justify-center rounded-md border border-[var(--ds-border)]">
                    <TeamIcon className="size-3.5" />
                  </div>
                  {team.name}
                  {isActive ? <Check aria-hidden className="ml-auto size-4" /> : null}
                </DropdownMenuItem>
              );
            })}
            {actionItem ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={actionItem.onSelect}>
                  <div className="flex size-6 items-center justify-center rounded-md border border-[var(--ds-border)] bg-transparent">
                    <Plus className="size-4" />
                  </div>
                  {actionItem.label}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
