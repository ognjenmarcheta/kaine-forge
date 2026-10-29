import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../../lib/cn";

/** Keys with which Radix roving focus moves between items. */
const NAVIGATION_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

type SegmentedControlAppearance = "brand" | "default";

/** Tells each item the control's look, so its text suits the track under it. */
const SegmentedControlAppearanceContext =
  React.createContext<SegmentedControlAppearance>("default");

interface SegmentedControlProps extends Omit<
  ToggleGroupPrimitive.ToggleGroupSingleProps,
  "type" | "value" | "defaultValue" | "onValueChange"
> {
  /**
   * `brand` suits a bold brand surface: the track is the brand's hovered fill, the items are in the
   * brand's inverse text, and the chosen item is a flat raised pill in ink. Defaults to `default`.
   */
  appearance?: SegmentedControlAppearance;
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
  (
    {
      appearance = "default",
      className,
      defaultValue,
      onFocus,
      onKeyDown,
      onValueChange,
      value,
      ...props
    },
    ref
  ) => {
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? "");
    const navigating = React.useRef(false);

    return (
      <SegmentedControlAppearanceContext.Provider value={appearance}>
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
            // Positioned, so the sr-only text of an item stays inside a scrolling control.
            "relative inline-flex items-center gap-ds-025 rounded-button bg-ds-bg-neutral p-ds-025",
            appearance === "brand" && "bg-ds-bg-brand-bold-hovered",
            className
          )}
          {...props}
        />
      </SegmentedControlAppearanceContext.Provider>
    );
  }
);
SegmentedControl.displayName = "SegmentedControl";

const SegmentedControlItem = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  const appearance = React.useContext(SegmentedControlAppearanceContext);

  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      // The focus ring is the shared offset outline in globals.css, so it stays apart from a filled item.
      data-slot="segmented-control-item"
      className={cn(
        "inline-flex h-ds-control-small items-center justify-center gap-ds-075 whitespace-nowrap rounded-button px-ds-150 text-body-sm font-medium text-ds-text-subtle transition-[color,background-color,box-shadow] duration-control ease-standard hover:text-ds-text disabled:pointer-events-none disabled:text-ds-text-disabled data-[state=on]:bg-ds-surface-raised data-[state=on]:text-ds-text data-[state=on]:shadow-raised",
        // The chosen item's hover keeps its ink over the inverse text of the others.
        appearance === "brand" &&
          "text-ds-text-brand-inverse hover:text-ds-text-brand-inverse data-[state=on]:shadow-none data-[state=on]:hover:text-ds-text",
        className
      )}
      {...props}
    />
  );
});
SegmentedControlItem.displayName = "SegmentedControlItem";

export { SegmentedControl, SegmentedControlItem };
export type { SegmentedControlProps };
