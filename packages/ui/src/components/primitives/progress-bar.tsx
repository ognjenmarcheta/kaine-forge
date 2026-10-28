import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/cn";

const progressBarVariants = cva(
  "h-full w-full rounded-full transition-transform duration-[var(--ds-motion-overlay)] ease-[var(--ds-motion-easing)]",
  {
    variants: {
      appearance: {
        brand: "bg-ds-bg-brand-bold",
        success: "bg-ds-bg-success-bold",
        danger: "bg-ds-bg-danger-bold",
        warning: "bg-ds-bg-warning-bold",
        information: "bg-ds-bg-information-bold"
      }
    },
    defaultVariants: {
      appearance: "brand"
    }
  }
);

interface ProgressBarProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof progressBarVariants> {
  value: number;
  max?: number;
  label?: string;
}

const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ className, appearance, value, max = 100, label, ...props }, ref) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));

    return (
      <div className={cn("w-full", className)}>
        {label && (
          <div className="mb-1 flex items-center justify-between text-body-sm">
            <span className="text-ds-text">{label}</span>
            <span className="text-ds-text-subtle">{Math.round(percentage)}%</span>
          </div>
        )}
        <div
          ref={ref}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label}
          className="h-2 w-full overflow-hidden rounded-full bg-ds-bg-neutral"
          {...props}
        >
          <div
            className={cn(progressBarVariants({ appearance }))}
            style={{ transform: `translateX(-${100 - percentage}%)` }}
          />
        </div>
      </div>
    );
  }
);
ProgressBar.displayName = "ProgressBar";

export { ProgressBar, progressBarVariants };
export type { ProgressBarProps };
