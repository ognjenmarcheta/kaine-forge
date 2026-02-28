import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";

const tagVariants = cva(
  "inline-flex items-center gap-1 rounded-[var(--ds-radius-050)] px-2 py-0.5 text-body-sm font-medium",
  {
    variants: {
      appearance: {
        default: "bg-[var(--ds-background-neutral)] text-[color:var(--ds-text)]",
        success: "bg-[var(--ds-background-success)] text-[color:var(--ds-text-success)]",
        warning: "bg-[var(--ds-background-warning)] text-[color:var(--ds-text-warning)]",
        danger: "bg-[var(--ds-background-danger)] text-[color:var(--ds-text-danger)]",
        information:
          "bg-[var(--ds-background-information)] text-[color:var(--ds-text-information)]",
        discovery: "bg-[var(--ds-background-discovery)] text-[color:var(--ds-text-discovery)]"
      }
    },
    defaultVariants: {
      appearance: "default"
    }
  }
);

interface TagProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof tagVariants> {
  removeLabel?: string;
  onRemove?: () => void;
}

const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
  ({ className, appearance, removeLabel, onRemove, children, ...props }, ref) => (
    <span ref={ref} className={cn(tagVariants({ appearance }), className)} {...props}>
      {children}
      {onRemove && (
        /* eslint-disable-next-line no-restricted-syntax -- Inline icon-only close affordance; using Button would add unwanted padding and styling. */
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 inline-flex items-center justify-center rounded-[var(--ds-radius-050)] p-0.5 text-[color:var(--ds-icon-subtle)] hover:text-[color:var(--ds-icon)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ds-border-focused)]"
          aria-label={removeLabel}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
);
Tag.displayName = "Tag";

export { Tag, tagVariants };
export type { TagProps };
