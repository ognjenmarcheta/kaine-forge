import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../../lib/cn";

const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-[var(--ds-radius-pill)] bg-[var(--ds-background-neutral)]">
      <SliderPrimitive.Range className="absolute h-full bg-[var(--ds-background-brand-bold)]" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-[var(--ds-radius-round)] border-2 border-[var(--ds-background-brand-bold)] bg-[var(--ds-surface)] ring-offset-[var(--ds-surface)] shadow-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-border-focused)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:text-[color:var(--ds-text-disabled)] disabled:border-[var(--ds-border)]" />
  </SliderPrimitive.Root>
));
Slider.displayName = "Slider";

export { Slider };
