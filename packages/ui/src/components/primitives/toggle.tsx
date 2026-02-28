import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../../lib/cn";

const Toggle = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-[var(--ds-control-small)] w-11 shrink-0 cursor-pointer items-center rounded-[var(--ds-radius-pill)] border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-border-focused)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface)] disabled:cursor-not-allowed disabled:text-[color:var(--ds-text-disabled)] disabled:border-[var(--ds-border)] data-[state=checked]:bg-[var(--ds-background-brand-bold)] data-[state=unchecked]:bg-[var(--ds-background-neutral-bold)]",
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-[var(--ds-radius-round)] bg-[var(--ds-surface)] shadow-raised ring-0 transition-transform data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitive.Root>
));
Toggle.displayName = "Toggle";

export { Toggle };
