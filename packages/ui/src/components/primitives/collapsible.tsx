import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";

import { cn } from "../../lib/cn";

const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
const CollapsibleContent = forwardRef<
  ComponentRef<typeof CollapsiblePrimitive.Content>,
  ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(({ children, className, ...props }, ref) => (
  <CollapsiblePrimitive.Content ref={ref} className={cn("ui-collapsible", className)} {...props}>
    <div className="ui-collapsible__size">
      <div className="ui-collapsible__body">{children}</div>
    </div>
  </CollapsiblePrimitive.Content>
));
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
