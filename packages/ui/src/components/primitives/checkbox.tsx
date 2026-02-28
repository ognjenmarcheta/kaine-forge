import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../../lib/cn";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-[var(--ds-border)] data-[state=checked]:bg-[var(--ds-background-brand-bold)] data-[state=checked]:text-[color:var(--ds-text-inverse)] data-[state=checked]:border-[var(--ds-border-brand)] focus-visible:border-[var(--ds-border-focused)] focus-visible:ring-[var(--ds-border-focused)]/50 aria-invalid:ring-[var(--ds-border-danger)]/20 aria-invalid:border-[var(--ds-border-danger)] size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:text-[color:var(--ds-text-disabled)] disabled:border-[var(--ds-border)]",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
