import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";
import { Button } from "../primitives/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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

interface FilterMenuBaseProps<Value extends string> {
  /** The edge of the button that the menu lines up with. Defaults to `end`, for a filter at the end of a header. */
  align?: "center" | "end" | "start";
  /** The button's look. Defaults to `subtle`; `raised` suits a white button on a gray page. */
  appearance?: "ghost" | "outline" | "raised" | "subtle";
  /** `false` leaves out the chevron, for a button whose icon already says what it opens, such as a calendar. */
  chevron?: boolean;
  className?: string;
  /** A decorative icon before the value. */
  icon?: React.ReactNode;
  /** The filter's name, such as "Period". It heads the menu and, hidden, starts the button's name. */
  label: string;
  options: readonly FilterMenuOption<Value>[];
  /**
   * What the button shows: `value` (default) the chosen option, or `label` the filter's name, with
   * the choice only in the button's name, such as a "Filter date" button.
   */
  show?: "label" | "value";
  /** The button height, as the button's compact, default, and spacious spacing. Defaults to `small`. */
  size?: "large" | "medium" | "small";
  /** `widest` sizes the button to its longest option, so it keeps its width when the value changes (LAYOUT-5). */
  width?: "auto" | "widest";
}

interface FilterMenuSingleProps<Value extends string> extends FilterMenuBaseProps<Value> {
  multiple?: false;
  onValueChange: (value: Value) => void;
  value: Value;
}

interface FilterMenuMultipleProps<Value extends string> extends FilterMenuBaseProps<Value> {
  /** Checkboxes instead of radios, and the menu stays open between choices. The button shows the `label`. */
  multiple: true;
  /** The chosen options in the order of `options`. */
  onValueChange: (value: Value[]) => void;
  value: readonly Value[];
}

export type FilterMenuProps<Value extends string> =
  FilterMenuMultipleProps<Value> | FilterMenuSingleProps<Value>;

const spacingBySize = { large: "spacious", medium: "default", small: "compact" } as const;

/**
 * A compact button that shows the current option of a filter and opens a menu of the options.
 * The button has no visible field label, so it is a menu button, not a field (FORM-1). With
 * `multiple`, the menu holds checkboxes and the button shows the filter's name.
 */
export function FilterMenu<Value extends string>(props: FilterMenuProps<Value>) {
  const {
    align = "end",
    appearance = "subtle",
    chevron = true,
    className,
    icon,
    label,
    options,
    show = "value",
    size = "small",
    width = "auto"
  } = props;
  const labelId = React.useId();
  const valueId = React.useId();
  const chosen = new Set<string>(props.multiple ? props.value : [props.value]);
  const showsLabel = props.multiple === true || show === "label";
  const iconSlot = icon ? (
    <span aria-hidden="true" className="inline-flex shrink-0 text-ds-icon [&>svg]:size-ds-200">
      {icon}
    </span>
  ) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          appearance={appearance}
          // The filter name, then the value, so the name holds what shows (WCAG 2.2 SC 2.5.3).
          aria-labelledby={`${labelId} ${valueId}`}
          className={cn("relative shrink-0 gap-ds-075 whitespace-nowrap", className)}
          spacing={spacingBySize[size]}
        >
          {showsLabel ? (
            <>
              {iconSlot}
              <span id={labelId}>{label}</span>
              <span className="sr-only" id={valueId}>
                {options
                  .filter((option) => chosen.has(option.value))
                  .map((option) => option.label)
                  .join(", ")}
              </span>
            </>
          ) : (
            <>
              <span className="sr-only" id={labelId}>
                {label}
              </span>
              {iconSlot}
              {width === "widest" ? (
                // Every option in one grid cell: the cell is as wide as the longest, and only the
                // chosen one shows.
                <span className="inline-grid text-start">
                  {options.map((option) =>
                    chosen.has(option.value) ? (
                      <span key={option.value} className="[grid-area:1/1]" id={valueId}>
                        {option.label}
                      </span>
                    ) : (
                      <span
                        key={option.value}
                        aria-hidden="true"
                        className="invisible [grid-area:1/1]"
                      >
                        {option.label}
                      </span>
                    )
                  )}
                </span>
              ) : (
                <span id={valueId}>
                  {options.find((option) => chosen.has(option.value))?.label}
                </span>
              )}
            </>
          )}
          {chevron ? (
            <ChevronDown aria-hidden="true" className="size-ds-200 shrink-0 text-ds-icon" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {props.multiple ? (
          options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={chosen.has(option.value)}
              onCheckedChange={(checked) =>
                props.onValueChange(
                  options
                    .filter((entry) =>
                      entry.value === option.value ? checked === true : chosen.has(entry.value)
                    )
                    .map((entry) => entry.value)
                )
              }
              // Keeps the menu open for the next choice.
              onSelect={(event) => event.preventDefault()}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <DropdownMenuRadioGroup
            value={props.value}
            onValueChange={(next) => {
              const option = options.find((entry) => entry.value === next);
              if (option) props.onValueChange(option.value);
            }}
          >
            {options.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
