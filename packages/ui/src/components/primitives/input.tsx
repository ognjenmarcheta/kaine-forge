import * as React from "react";

import { cn } from "../../lib/cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtlest)] selection:bg-[var(--ds-background-brand-bold)] selection:text-[color:var(--ds-text-inverse)] dark:bg-[var(--ds-background-neutral)]/30 border-[var(--ds-border)] h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-[var(--ds-border-focused)] focus-visible:ring-[var(--ds-border-focused)]/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-[var(--ds-border-danger)]/20 dark:aria-invalid:ring-[var(--ds-border-danger)]/40 aria-invalid:border-[var(--ds-border-danger)]",
        className
      )}
      {...props}
    />
  );
}

export { Input };
