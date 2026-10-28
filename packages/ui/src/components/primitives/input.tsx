import * as React from "react";

import { cn } from "../../lib/cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-ds-text placeholder:text-ds-text-subtlest selection:bg-ds-bg-brand-bold selection:text-ds-text-brand-inverse border-ds-field-border h-9 w-full min-w-0 rounded-field border bg-transparent px-3 py-1 text-body-lg shadow-raised transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-body file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-ds-text-disabled disabled:border-ds-border md:text-body",
        "focus-visible:border-ds-border-focused focus-visible:ring-ds-border-focused/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-ds-border-danger/20 aria-invalid:border-ds-border-danger",
        className
      )}
      {...props}
    />
  );
}

export { Input };
