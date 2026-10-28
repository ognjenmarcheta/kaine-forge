import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../../lib/cn";

/** Keys with which Radix roving focus moves between items. */
const NAVIGATION_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

interface SegmentedControlProps extends Omit<
  ToggleGroupPrimitive.ToggleGroupSingleProps,
  "type" | "value" | "defaultValue" | "onValueChange"
> {
  value?: string;
  defaultValue?: string;
  /** Called with the newly selected value; a segmented control never clears its selection. */
  onValueChange?: (value: string) => void;
}

/**
 * One choice from a few options. The items are radios: arrow keys move focus and select the
 * focused item, and pressing the selected item keeps it selected.
 */
const SegmentedControl = React.forwardRef<HTMLDivElement, SegmentedControlProps>(
  ({ className, defaultValue, onFocus, onKeyDown, onValueChange, value, ...props }, ref) => {
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? "");
    const navigating = React.useRef(false);

    return (
      <ToggleGroupPrimitive.Root
        ref={ref}
        type="single"
        value={value ?? uncontrolledValue}
        onValueChange={(next) => {
          // Radix clears the value when the selected item is pressed again.
          if (next === "") return;
          setUncontrolledValue(next);
          onValueChange?.(next);
        }}
        onKeyDown={(event) => {
          navigating.current = NAVIGATION_KEYS.has(event.key);
          onKeyDown?.(event);
        }}
        onFocus={(event) => {
          // Radix moves focus after the key press; the radio pattern selects the item it lands on.
          if (navigating.current && event.target !== event.currentTarget) {
            navigating.current = false;
            if (event.target instanceof HTMLElement) event.target.click();
          }
          onFocus?.(event);
        }}
        className={cn(
          "inline-flex items-center gap-ds-025 rounded-button bg-ds-bg-neutral p-ds-025",
          className
        )}
        {...props}
      />
    );
  }
);
SegmentedControl.displayName = "SegmentedControl";

const SegmentedControlItem = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      "inline-flex h-ds-control-small items-center justify-center gap-ds-075 whitespace-nowrap rounded-button px-ds-150 text-body-sm font-medium text-ds-text-subtle transition-[color,background-color,box-shadow] duration-control ease-standard hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-border-focused disabled:pointer-events-none disabled:text-ds-text-disabled data-[state=on]:bg-ds-surface-raised data-[state=on]:text-ds-text data-[state=on]:shadow-raised",
      className
    )}
    {...props}
  />
));
SegmentedControlItem.displayName = "SegmentedControlItem";

export { SegmentedControl, SegmentedControlItem };
export type { SegmentedControlProps };
