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
      "peer inline-flex h-ds-control-small w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-border-focused focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface disabled:cursor-not-allowed disabled:text-ds-text-disabled disabled:border-ds-border data-[state=checked]:bg-ds-bg-brand-bold data-[state=unchecked]:bg-ds-bg-neutral-bold",
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-ds-surface shadow-raised ring-0 transition-transform data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitive.Root>
));
Toggle.displayName = "Toggle";

export { Toggle };
