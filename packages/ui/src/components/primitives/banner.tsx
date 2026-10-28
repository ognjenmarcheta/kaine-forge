import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";

const bannerVariants = cva(
  "flex w-full items-center justify-between gap-3 px-4 py-3 text-body font-medium",
  {
    variants: {
      appearance: {
        information: "bg-ds-bg-information-bold text-ds-text-inverse",
        warning: "bg-ds-bg-warning-bold text-ds-text-warning-inverse",
        error: "bg-ds-bg-danger-bold text-ds-text-inverse",
        announcement: "bg-ds-bg-discovery-bold text-ds-text-inverse"
      }
    },
    defaultVariants: {
      appearance: "information"
    }
  }
);

interface BannerProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof bannerVariants> {
  dismissLabel?: string;
  icon?: React.ReactNode;
  onDismiss?: () => void;
}

const Banner = React.forwardRef<HTMLDivElement, BannerProps>(
  ({ className, appearance, dismissLabel, icon, onDismiss, children, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(bannerVariants({ appearance }), className)}
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
