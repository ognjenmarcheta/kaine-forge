import { Building2, Check, ChevronRight, ChevronsUpDown, Globe2, Palette } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../primitives/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "../primitives/sidebar";
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
  display?: "full" | "icon" | "compact";
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
  const { isMobile, state } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;
  const isIconDisplay = display === "icon";
  const isCompact = display === "compact";
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const tooltipEnabled = !isCompact || isCollapsed;
  const iconNode = resolveShellIcon(icon);
  const selectedOption = options.find((option) => option.value === value);
  const displayText = selectedOption?.label ?? placeholder ?? "";
  const triggerButton = (
    <SidebarMenuButton
      aria-label={ariaLabel ?? label}
      aria-description={isCompact ? displayText : undefined}
      className={cn(
        "data-[state=open]:bg-[var(--ds-background-neutral-hovered)] data-[state=open]:text-[color:var(--ds-text)]",
        isIconDisplay &&
          "size-8 justify-center p-0 bg-[var(--ds-background-neutral)] text-[color:var(--ds-text-subtle)]",
        isCompact && "ui-shell-select-compact",
        className
      )}
      disabled={disabled}
      size={isIconDisplay || isCompact ? "default" : "lg"}
    >
      {isIconDisplay ? (
        iconNode
      ) : isCompact ? (
        <>
          {iconNode}
          <span className="ui-shell-select-compact__label">{label}</span>
          <span className="ui-shell-select-compact__value">{displayText}</span>
          <ChevronRight aria-hidden className="text-[color:var(--ds-icon-subtle)]" />
        </>
      ) : (
        <>
          <div className="bg-[var(--ds-background-brand-bold)] text-[color:var(--ds-text-inverse)] flex shrink-0 aspect-square size-8 items-center justify-center rounded-lg">
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
          {isIconDisplay || isCompact ? (
            <Tooltip
              open={tooltipEnabled && tooltipOpen}
              onOpenChange={(open) => setTooltipOpen(tooltipEnabled && open)}
            >
              <TooltipTrigger asChild>{triggerNode}</TooltipTrigger>
              <TooltipContent side={isCollapsed ? "right" : "top"}>
                {isCompact ? `${label}: ${displayText}` : label}
              </TooltipContent>
            </Tooltip>
          ) : (
            triggerNode
          )}
          <DropdownMenuContent
            align="start"
            side={isCollapsed ? "right" : isCompact ? "top" : "bottom"}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-[12rem]"
          >
            {isCompact ? (
              <DropdownMenuRadioGroup value={value ?? ""} onValueChange={onValueChange}>
                {options.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                    {...(option.disabled !== undefined ? { disabled: option.disabled } : {})}
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            ) : (
              options.map((option) => (
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
              ))
            )}
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
