import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/cn";

const progressBarVariants = cva("h-full rounded-[var(--ds-radius-pill)] transition-all", {
  variants: {
    appearance: {
      brand: "bg-[var(--ds-background-brand-bold)]",
      success: "bg-[var(--ds-background-success-bold)]",
      danger: "bg-[var(--ds-background-danger-bold)]",
      warning: "bg-[var(--ds-background-warning-bold)]",
      information: "bg-[var(--ds-background-information-bold)]"
    }
  },
  defaultVariants: {
    appearance: "brand"
  }
});

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
            <span className="text-[color:var(--ds-text)]">{label}</span>
            <span className="text-[color:var(--ds-text-subtle)]">{Math.round(percentage)}%</span>
          </div>
        )}
        <div
          ref={ref}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label}
          className="h-2 w-full overflow-hidden rounded-[var(--ds-radius-pill)] bg-[var(--ds-background-neutral)]"
          {...props}
        >
          <div
            className={cn(progressBarVariants({ appearance }))}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }
);
ProgressBar.displayName = "ProgressBar";

export { ProgressBar, progressBarVariants };
export type { ProgressBarProps };
