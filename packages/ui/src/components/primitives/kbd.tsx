import * as React from "react";

import { cn } from "../../lib/cn";

/** A keyboard key hint, such as the K in a Cmd+K shortcut. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex items-center justify-center rounded-sm border border-ds-border bg-ds-surface-sunken px-ds-050 font-mono text-body-xs text-ds-text-subtle",
        className
      )}
      {...props}
    />
  );
}

export { Kbd };
