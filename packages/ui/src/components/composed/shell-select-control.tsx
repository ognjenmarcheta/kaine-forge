import { Building2, Check, ChevronsUpDown, Globe2, Palette } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../primitives/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../primitives/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../primitives/tooltip";

export interface ShellSelectControlOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface ShellSelectControlActionItem {
  label: string;
  onSelect: () => void;
}

export type ShellSelectControlIcon = "language" | "organization" | "theme";

export interface ShellSelectControlProps {
  actionItem?: ShellSelectControlActionItem;
  ariaLabel?: string;
  className?: string;
  display?: "full" | "icon";
  disabled?: boolean;
  icon?: ShellSelectControlIcon | React.ReactNode;
  label: string;
  onValueChange: (value: string) => void;
  options: ShellSelectControlOption[];
  placeholder?: string;
  value?: string;
}

export const SHELL_ACTION_ITEM_VALUE = "__ui_shell_select_action_item__";

interface ApplyShellSelectControlChangeInput {
  actionItem?: ShellSelectControlActionItem;
  nextValue: string;
  onValueChange: (value: string) => void;
}

function resolveShellIcon(icon: ShellSelectControlIcon | React.ReactNode | undefined) {
  if (!icon) {
    return null;
  }

  if (React.isValidElement(icon)) {
    return icon;
  }

  switch (icon) {
    case "organization":
      return <Building2 aria-hidden className="size-4" />;
    case "language":
      return <Globe2 aria-hidden className="size-4" />;
    case "theme":
      return <Palette aria-hidden className="size-4" />;
    default:
      return null;
  }
}

export function resolveShellSelectDisplayValue(value: string | undefined): string | undefined {
  return value ? value : undefined;
}

export function applyShellSelectControlChange({
  actionItem,
  nextValue,
  onValueChange
}: ApplyShellSelectControlChangeInput): void {
  if (actionItem && nextValue === SHELL_ACTION_ITEM_VALUE) {
    actionItem.onSelect();
    return;
  }

  onValueChange(nextValue);
}

export function ShellSelectControl({
  actionItem,
  ariaLabel,
  className,
  display = "full",
  disabled = false,
  icon,
  label,
  onValueChange,
  options,
  placeholder,
  value
}: ShellSelectControlProps) {
  const isIconDisplay = display === "icon";
  const iconNode = resolveShellIcon(icon);
  const selectedOption = options.find((option) => option.value === value);
  const displayText = selectedOption?.label ?? placeholder ?? "";
  const triggerButton = (
    <SidebarMenuButton
      aria-label={ariaLabel ?? label}
      className={cn(
        "data-[state=open]:bg-[var(--ds-background-neutral-hovered)] data-[state=open]:text-[color:var(--ds-text)]",
        isIconDisplay && "size-8 justify-center p-0",
        className
      )}
      disabled={disabled}
      size={isIconDisplay ? "default" : "lg"}
    >
      {isIconDisplay ? (
        <div className="bg-[var(--ds-background-brand-bold)] text-[color:var(--ds-text-inverse)] flex aspect-square size-8 items-center justify-center rounded-lg">
          {iconNode}
        </div>
      ) : (
        <>
          <div className="bg-[var(--ds-background-brand-bold)] text-[color:var(--ds-text-inverse)] flex aspect-square size-8 items-center justify-center rounded-lg">
            {iconNode}
          </div>
          <div className="grid flex-1 min-w-0 text-left leading-tight">
            <span className="truncate text-body-xs text-[color:var(--ds-text-subtle)]">
              {label}
            </span>
            <span className="truncate text-body font-medium text-[color:var(--ds-text)]">
              {displayText}
            </span>
          </div>
          <ChevronsUpDown
            aria-hidden
            className="ml-auto size-4 text-[color:var(--ds-icon-subtle)]"
          />
        </>
      )}
    </SidebarMenuButton>
  );
  const triggerNode = <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>;

  return (
    <SidebarMenu className={isIconDisplay ? "w-auto" : "w-full"}>
      <SidebarMenuItem>
        <DropdownMenu>
          {isIconDisplay ? (
            <Tooltip>
              <TooltipTrigger asChild>{triggerNode}</TooltipTrigger>
              <TooltipContent side="top">{label}</TooltipContent>
            </Tooltip>
          ) : (
            triggerNode
          )}
          <DropdownMenuContent
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-[12rem]"
          >
            {options.map((option) => (
              <DropdownMenuItem
                key={option.value}
                {...(option.disabled !== undefined ? { disabled: option.disabled } : {})}
                onSelect={() => {
                  if (option.disabled) {
                    return;
                  }
                  applyShellSelectControlChange({
                    nextValue: option.value,
                    onValueChange,
                    ...(actionItem ? { actionItem } : {})
                  });
                }}
              >
                {option.label}
                {option.value === resolveShellSelectDisplayValue(value) ? (
                  <Check aria-hidden className="ml-auto size-4" />
                ) : null}
              </DropdownMenuItem>
            ))}
            {actionItem ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-[color:var(--ds-link)]"
                  onSelect={() => {
                    applyShellSelectControlChange({
                      actionItem,
                      nextValue: SHELL_ACTION_ITEM_VALUE,
                      onValueChange
                    });
                  }}
                >
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
