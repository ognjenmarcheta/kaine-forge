import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../../lib/cn";

const Tabs = TabsPrimitive.Root;

/** The tab list look, shared with link-based tab navigation. */
const tabsListClassName =
  "inline-flex h-10 items-center justify-center gap-1 border-b border-[var(--ds-border)] text-[color:var(--ds-text-subtle)]";

/** The tab look; a link with `aria-current="page"` shows the same selected state as an active tab. */
const tabsTriggerClassName =
  "inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-body font-medium text-[color:var(--ds-text-subtle)] ring-offset-[var(--ds-surface)] transition-[color,background-color,border-color,box-shadow] duration-[var(--ds-motion-control)] ease-[var(--ds-motion-easing)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-border-focused)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:text-[color:var(--ds-text-disabled)] data-[state=active]:border-b-[length:var(--ds-border-width-thick)] data-[state=active]:border-[var(--ds-border-selected)] data-[state=active]:text-[color:var(--ds-text)] data-[state=active]:shadow-none aria-[current=page]:border-b-[length:var(--ds-border-width-thick)] aria-[current=page]:border-[var(--ds-border-selected)] aria-[current=page]:text-[color:var(--ds-text)]";

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn(tabsListClassName, className)} {...props} />
));
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger ref={ref} className={cn(tabsTriggerClassName, className)} {...props} />
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

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListClassName, tabsTriggerClassName };
