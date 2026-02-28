import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";

const bannerVariants = cva(
  "flex w-full items-center justify-between gap-3 px-4 py-3 text-body font-medium",
  {
    variants: {
      appearance: {
        information:
          "bg-[var(--ds-background-information-bold)] text-[color:var(--ds-text-inverse)]",
        warning:
          "bg-[var(--ds-background-warning-bold)] text-[color:var(--ds-text-warning-inverse)]",
        error: "bg-[var(--ds-background-danger-bold)] text-[color:var(--ds-text-inverse)]",
        announcement: "bg-[var(--ds-background-discovery-bold)] text-[color:var(--ds-text-inverse)]"
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
          className="shrink-0 rounded-[var(--ds-radius-100)] p-1 hover:bg-[var(--ds-background-neutral-subtle-hovered)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
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
