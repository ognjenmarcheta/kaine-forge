import { HoverCard as HoverCardPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../../lib/cn";

const HoverCard = HoverCardPrimitive.Root;
const HoverCardTrigger = HoverCardPrimitive.Trigger;

const HoverCardContent = React.forwardRef<
  React.ComponentRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <HoverCardPrimitive.Content
    ref={ref}
    align={align}
    sideOffset={sideOffset}
    className={cn(
      "z-50 w-64 rounded-[var(--ds-radius-200)] border border-[var(--ds-border)] bg-[var(--ds-surface-overlay)] p-4 text-[color:var(--ds-text)] shadow-overlay ui-motion-menu outline-none ",
      className
    )}
    {...props}
  />
));
HoverCardContent.displayName = "HoverCardContent";

export { HoverCard, HoverCardTrigger, HoverCardContent };
