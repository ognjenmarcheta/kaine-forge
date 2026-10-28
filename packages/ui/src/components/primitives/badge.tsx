import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-body-sm font-medium",
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
        className: "bg-ds-bg-neutral text-ds-text"
      },
      {
        appearance: "default",
        emphasis: "bold",
        className: "bg-ds-bg-neutral-bold text-ds-text-inverse"
      },
      {
        appearance: "success",
        emphasis: "subtle",
        className: "bg-ds-bg-success text-ds-text-success"
      },
      {
        appearance: "success",
        emphasis: "bold",
        className: "bg-ds-bg-success-bold text-ds-text-inverse"
      },
      {
        appearance: "warning",
        emphasis: "subtle",
        className: "bg-ds-bg-warning text-ds-text-warning"
      },
      {
        appearance: "warning",
        emphasis: "bold",
        className: "bg-ds-bg-warning-bold text-ds-text-warning-inverse"
      },
      {
        appearance: "danger",
        emphasis: "subtle",
        className: "bg-ds-bg-danger text-ds-text-danger"
      },
      {
        appearance: "danger",
        emphasis: "bold",
        className: "bg-ds-bg-danger-bold text-ds-text-inverse"
      },
      {
        appearance: "information",
        emphasis: "subtle",
        className: "bg-ds-bg-information text-ds-text-information"
      },
      {
        appearance: "information",
        emphasis: "bold",
        className: "bg-ds-bg-information-bold text-ds-text-inverse"
      },
      {
        appearance: "discovery",
        emphasis: "subtle",
        className: "bg-ds-bg-discovery text-ds-text-discovery"
      },
      {
        appearance: "discovery",
        emphasis: "bold",
        className: "bg-ds-bg-discovery-bold text-ds-text-inverse"
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
