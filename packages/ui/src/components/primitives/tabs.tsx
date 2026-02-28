import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../../lib/cn";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center gap-1 border-b border-[var(--ds-border)] text-[color:var(--ds-text-subtle)]",
      className
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-body font-medium text-[color:var(--ds-text-subtle)] ring-offset-[var(--ds-surface)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-border-focused)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:text-[color:var(--ds-text-disabled)] data-[state=active]:border-b-[length:var(--ds-border-width-thick)] data-[state=active]:border-[var(--ds-border-selected)] data-[state=active]:text-[color:var(--ds-text)] data-[state=active]:shadow-none",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-[var(--ds-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-border-focused)] focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
