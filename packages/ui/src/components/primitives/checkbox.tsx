import { CheckIcon, MinusIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../../lib/cn";

/**
 * A 16px box with a 24px hit area (WCAG 2.2 SC 2.5.8). The indeterminate state, such as a
 * select-all box with some rows selected, draws a minus instead of the check.
 */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer group/checkbox relative border-ds-field-border data-[state=checked]:bg-ds-bg-brand-bold data-[state=checked]:text-ds-text-brand-inverse data-[state=checked]:border-ds-border-brand data-[state=indeterminate]:bg-ds-bg-brand-bold data-[state=indeterminate]:text-ds-text-brand-inverse data-[state=indeterminate]:border-ds-border-brand focus-visible:border-ds-border-focused focus-visible:ring-ds-border-focused/50 aria-invalid:ring-ds-border-danger/20 aria-invalid:border-ds-border-danger size-4 shrink-0 rounded-sm border shadow-raised outline-none after:absolute after:-inset-ds-050 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:text-ds-text-disabled disabled:border-ds-border",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-ds-150 group-data-[state=indeterminate]/checkbox:hidden" />
        <MinusIcon className="hidden size-ds-150 group-data-[state=indeterminate]/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
