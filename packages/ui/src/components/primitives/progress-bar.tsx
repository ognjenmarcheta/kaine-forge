import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/cn";

const progressBarVariants = cva(
  "h-full w-full rounded-full transition-transform duration-overlay ease-standard",
  {
    variants: {
      appearance: {
        brand: "bg-ds-bg-brand-bold",
        success: "bg-ds-bg-success-bold",
        danger: "bg-ds-bg-danger-bold",
        warning: "bg-ds-bg-warning-bold",
        information: "bg-ds-bg-information-bold",
        "chart-1": "bg-ds-chart-1",
        "chart-2": "bg-ds-chart-2",
        "chart-3": "bg-ds-chart-3",
        "chart-4": "bg-ds-chart-4",
        "chart-5": "bg-ds-chart-5",
        "chart-6": "bg-ds-chart-6"
      }
    },
    defaultVariants: {
      appearance: "brand"
    }
  }
);

/** The track thickness, from the theme's spacing steps: 4, 8, 12, or 20px. */
const progressTrackVariants = cva("w-full overflow-hidden rounded-full bg-ds-bg-neutral", {
  variants: {
    size: {
      sm: "h-ds-050",
      md: "h-ds-100",
      lg: "h-ds-150",
      xl: "h-ds-250"
    }
  },
  defaultVariants: {
    size: "md"
  }
});

interface ProgressBarProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressBarVariants>,
    VariantProps<typeof progressTrackVariants> {
  value: number;
  max?: number;
  label?: string;
}

const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ className, appearance, size, value, max = 100, label, ...props }, ref) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));

    return (
      <div className={cn("w-full", className)}>
        {label && (
          <div className="mb-ds-050 flex items-center justify-between text-body-sm">
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
          className={progressTrackVariants({ size })}
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
