import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-badge px-2 py-0.5 text-body-sm font-medium",
  {
    variants: {
      appearance: {
        default: "",
        success: "",
        warning: "",
        danger: "",
        information: "",
        discovery: "",
        selected: ""
      },
      emphasis: {
        subtle: "",
        bold: "",
        // A hairline in the role's border color and no fill; the inset ring keeps the badge's size.
        outline: "ring-1 ring-inset"
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
      },
      {
        appearance: "selected",
        emphasis: "subtle",
        className: "bg-ds-bg-selected text-ds-text-selected"
      },
      {
        appearance: "selected",
        emphasis: "bold",
        className: "bg-ds-bg-selected-bold text-ds-text-brand-inverse"
      },
      { appearance: "default", emphasis: "outline", className: "text-ds-text ring-ds-border" },
      {
        appearance: "success",
        emphasis: "outline",
        className: "text-ds-text-success ring-ds-border-success"
      },
      {
        appearance: "warning",
        emphasis: "outline",
        className: "text-ds-text-warning ring-ds-border-warning"
      },
      {
        appearance: "danger",
        emphasis: "outline",
        className: "text-ds-text-danger ring-ds-border-danger"
      },
      {
        appearance: "information",
        emphasis: "outline",
        className: "text-ds-text-information ring-ds-border-information"
      },
      {
        appearance: "discovery",
        emphasis: "outline",
        className: "text-ds-text-discovery ring-ds-border-discovery"
      },
      // The theme check measures text-brand on the page, not text-selected.
      {
        appearance: "selected",
        emphasis: "outline",
        className: "text-ds-text-brand ring-ds-border-selected"
      }
    ],
    defaultVariants: {
      appearance: "default",
      emphasis: "subtle"
    }
  }
);

/**
 * `appearance="selected"` marks the chosen item in a set, in the selected role. `emphasis="outline"`
 * draws the role's text and border on the surface behind, with no fill.
 */
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
