import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";

const bannerVariants = cva(
  "flex w-full items-center justify-between gap-3 px-4 py-3 text-body font-medium",
  {
    variants: {
      appearance: {
        information: "",
        warning: "",
        error: "",
        announcement: ""
      },
      emphasis: {
        bold: "",
        subtle: ""
      }
    },
    compoundVariants: [
      {
        appearance: "information",
        emphasis: "bold",
        className: "bg-ds-bg-information-bold text-ds-text-inverse"
      },
      {
        appearance: "warning",
        emphasis: "bold",
        className: "bg-ds-bg-warning-bold text-ds-text-warning-inverse"
      },
      {
        appearance: "error",
        emphasis: "bold",
        className: "bg-ds-bg-danger-bold text-ds-text-inverse"
      },
      {
        appearance: "announcement",
        emphasis: "bold",
        className: "bg-ds-bg-discovery-bold text-ds-text-inverse"
      },
      {
        appearance: "information",
        emphasis: "subtle",
        className: "bg-ds-bg-information text-ds-text-information"
      },
      {
        appearance: "warning",
        emphasis: "subtle",
        className: "bg-ds-bg-warning text-ds-text-warning"
      },
      { appearance: "error", emphasis: "subtle", className: "bg-ds-bg-danger text-ds-text-danger" },
      {
        appearance: "announcement",
        emphasis: "subtle",
        className: "bg-ds-bg-discovery text-ds-text-discovery"
      }
    ],
    defaultVariants: {
      appearance: "information",
      emphasis: "bold"
    }
  }
);

interface BannerProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof bannerVariants> {
  dismissLabel?: string;
  icon?: React.ReactNode;
  onDismiss?: () => void;
  /**
   * Interrupts the screen reader (`role="alert"`), for a problem that needs attention now.
   * Without it the banner is a polite `role="status"`, so a note shown on load is not announced.
   */
  urgent?: boolean;
}

const Banner = React.forwardRef<HTMLDivElement, BannerProps>(
  (
    {
      className,
      appearance,
      dismissLabel,
      emphasis,
      icon,
      onDismiss,
      urgent = false,
      children,
      ...props
    },
    ref
  ) => (
    <div
      ref={ref}
      role={urgent ? "alert" : "status"}
      className={cn(bannerVariants({ appearance, emphasis }), className)}
      {...props}
    >
      <div className="flex items-center gap-2">
        {icon && <span className="shrink-0">{icon}</span>}
        <span>{children}</span>
      </div>
      {onDismiss && (
        // eslint-disable-next-line no-restricted-syntax
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md p-1 hover:bg-ds-bg-neutral-subtle-hovered focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          aria-label={dismissLabel}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
);
Banner.displayName = "Banner";

export { Banner, bannerVariants };
export type { BannerProps };
