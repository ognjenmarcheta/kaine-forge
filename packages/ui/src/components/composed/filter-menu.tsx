import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";
import { Button } from "../primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "../primitives/dropdown-menu";

export interface FilterMenuOption<Value extends string = string> {
  label: string;
  value: Value;
}

export interface FilterMenuProps<Value extends string> {
  /** The edge of the button that the menu lines up with. Defaults to `end`, for a filter at the end of a header. */
  align?: "center" | "end" | "start";
  /** The button's look. Defaults to `subtle`; `raised` suits a white button on a gray page. */
  appearance?: "ghost" | "outline" | "raised" | "subtle";
  className?: string;
  /** A decorative icon before the value. */
  icon?: React.ReactNode;
  /** The filter's name, such as "Period". It heads the menu and, hidden, starts the button's name. */
  label: string;
  onValueChange: (value: Value) => void;
  options: readonly FilterMenuOption<Value>[];
  value: Value;
}

/**
 * A compact button that shows the current option of a filter and opens a menu of the options.
 * The button has no visible field label, so it is a menu button, not a field (FORM-1).
 */
export function FilterMenu<Value extends string>({
  align = "end",
  appearance = "subtle",
  className,
  icon,
  label,
  onValueChange,
  options,
  value
}: FilterMenuProps<Value>) {
  const labelId = React.useId();
  const valueId = React.useId();
  const current = options.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          appearance={appearance}
          // The hidden filter name, then the visible value, so the name holds what shows (WCAG 2.2 SC 2.5.3).
          aria-labelledby={`${labelId} ${valueId}`}
          className={cn("relative shrink-0 gap-ds-075 whitespace-nowrap", className)}
          spacing="compact"
        >
          <span className="sr-only" id={labelId}>
            {label}
          </span>
          {icon ? (
            <span
              aria-hidden="true"
              className="inline-flex shrink-0 text-ds-icon [&>svg]:size-ds-200"
            >
              {icon}
            </span>
          ) : null}
          <span id={valueId}>{current?.label}</span>
          <ChevronDown aria-hidden="true" className="size-ds-200 shrink-0 text-ds-icon" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            const option = options.find((entry) => entry.value === next);
            if (option) onValueChange(option.value);
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
