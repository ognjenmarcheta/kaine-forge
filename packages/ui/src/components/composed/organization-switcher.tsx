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

export interface OrganizationSwitcherItem {
  disabled?: boolean;
  icon?: React.ElementType;
  name: string;
  subtitle?: string;
  value: string;
}

export interface OrganizationSwitcherActionItem {
  label: string;
  onSelect: () => void;
}

export interface OrganizationSwitcherProps {
  actionItem?: OrganizationSwitcherActionItem;
  ariaLabel?: string;
  className?: string;
  label: string;
  onValueChange: (value: string) => void;
  organizations: OrganizationSwitcherItem[];
  value?: string;
}

export function OrganizationSwitcher({
  actionItem,
  ariaLabel,
  className,
  label,
  onValueChange,
  organizations,
  value
}: OrganizationSwitcherProps) {
  const { isMobile } = useSidebar();
  const activeOrganization =
    organizations.find((organization) => organization.value === value) ?? organizations[0];

  if (!activeOrganization) {
    return null;
  }

  const ActiveIcon = activeOrganization.icon ?? Building2;

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
                <span className="truncate font-medium">{activeOrganization.name}</span>
                <span className="truncate text-xs text-[color:var(--ds-text-subtle)]">
                  {activeOrganization.subtitle ?? label}
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
            {organizations.map((organization) => {
              const OrganizationIcon = organization.icon ?? Building2;
              const isActive = organization.value === activeOrganization.value;

              return (
                <DropdownMenuItem
                  key={organization.value}
                  {...(organization.disabled !== undefined
                    ? { disabled: organization.disabled }
                    : {})}
                  onSelect={() => {
                    if (!organization.disabled) {
                      onValueChange(organization.value);
                    }
                  }}
                >
                  <div className="flex size-6 items-center justify-center rounded-md border border-[var(--ds-border)]">
                    <OrganizationIcon className="size-3.5" />
                  </div>
                  {organization.name}
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
