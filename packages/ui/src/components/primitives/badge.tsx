import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-[var(--ds-radius-pill)] px-2 py-0.5 text-body-sm font-medium",
  {
    variants: {
      appearance: {
        default: "",
        success: "",
        warning: "",
        danger: "",
        information: "",
        discovery: ""
      },
      emphasis: {
        subtle: "",
        bold: ""
      }
    },
    compoundVariants: [
      {
        appearance: "default",
        emphasis: "subtle",
        className: "bg-[var(--ds-background-neutral)] text-[color:var(--ds-text)]"
      },
      {
        appearance: "default",
        emphasis: "bold",
        className: "bg-[var(--ds-background-neutral-bold)] text-[color:var(--ds-text-inverse)]"
      },
      {
        appearance: "success",
        emphasis: "subtle",
        className: "bg-[var(--ds-background-success)] text-[color:var(--ds-text-success)]"
      },
      {
        appearance: "success",
        emphasis: "bold",
        className: "bg-[var(--ds-background-success-bold)] text-[color:var(--ds-text-inverse)]"
      },
      {
        appearance: "warning",
        emphasis: "subtle",
        className: "bg-[var(--ds-background-warning)] text-[color:var(--ds-text-warning)]"
      },
      {
        appearance: "warning",
        emphasis: "bold",
        className:
          "bg-[var(--ds-background-warning-bold)] text-[color:var(--ds-text-warning-inverse)]"
      },
      {
        appearance: "danger",
        emphasis: "subtle",
        className: "bg-[var(--ds-background-danger)] text-[color:var(--ds-text-danger)]"
      },
      {
        appearance: "danger",
        emphasis: "bold",
        className: "bg-[var(--ds-background-danger-bold)] text-[color:var(--ds-text-inverse)]"
      },
      {
        appearance: "information",
        emphasis: "subtle",
        className: "bg-[var(--ds-background-information)] text-[color:var(--ds-text-information)]"
      },
      {
        appearance: "information",
        emphasis: "bold",
        className: "bg-[var(--ds-background-information-bold)] text-[color:var(--ds-text-inverse)]"
      },
      {
        appearance: "discovery",
        emphasis: "subtle",
        className: "bg-[var(--ds-background-discovery)] text-[color:var(--ds-text-discovery)]"
      },
      {
        appearance: "discovery",
        emphasis: "bold",
        className: "bg-[var(--ds-background-discovery-bold)] text-[color:var(--ds-text-inverse)]"
      }
    ],
    defaultVariants: {
      appearance: "default",
      emphasis: "subtle"
    }
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, appearance, emphasis, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ appearance, emphasis }), className)} {...props} />
  )
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
export type { BadgeProps };
