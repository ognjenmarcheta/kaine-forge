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
        // The warning fill is a light amber for ink text; on a track it needs its border color.
        warning: "bg-ds-border-warning",
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
const progressTrackVariants = cva("w-full overflow-hidden rounded-full", {
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

/**
 * The look of the part not done. Each chart fill keeps 3:1 against every look in both modes of
 * every theme: `sunken` is a pair the theme check measures, and `hatch` and `none` leave the
 * surface under the bar around the fill.
 */
const TRACK_LOOKS = {
  neutral: "bg-ds-bg-neutral",
  sunken: "bg-ds-surface-sunken",
  hatch: "bg-hatch text-ds-border-bold",
  none: ""
} as const;

type ProgressBarAppearance = NonNullable<VariantProps<typeof progressBarVariants>["appearance"]>;

/** One fill of a bar of several, such as the tasks one team has done. */
interface ProgressBarPart {
  key: string;
  value: number;
  appearance: ProgressBarAppearance;
}

interface ProgressBarBaseProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressBarVariants>,
    VariantProps<typeof progressTrackVariants> {
  max?: number;
  label?: string;
  /** The track thickness in pixels, such as 6 or 48, in place of a `size` step. */
  height?: number;
  /**
   * The part not done: a faint tint, the sunken surface, thin lines in the bold border color,
   * or nothing. @defaultValue "neutral"
   */
  track?: keyof typeof TRACK_LOOKS;
  /** Sets the fills and the part not done apart with a surface gap, each with round ends. */
  gap?: boolean;
}

/** One value out of `max`, in the `appearance` color. */
interface ProgressBarValueProps {
  value: number;
  parts?: never;
}

/** Several fills end to end from the start; `aria-valuenow` is their total. */
interface ProgressBarPartsProps {
  parts: readonly ProgressBarPart[];
  value?: never;
}

type ProgressBarProps = ProgressBarBaseProps & (ProgressBarValueProps | ProgressBarPartsProps);

/** The flex share of each fill, cut where the bar is full, and of the part not done. */
function fillShares(parts: readonly { value: number }[], max: number) {
  let used = 0;
  const fills = parts.map((part) => {
    const share = Math.min(Math.max(part.value, 0), Math.max(max - used, 0));
    used += share;
    return share;
  });
  return { fills, rest: Math.max(max - used, 0) };
}

/**
 * Progress toward `max` as a filled track, with an optional caption. Several `parts` fill it end
 * to end, `gap` sets the fills apart from the rest, and a fill grows to a new value with the
 * motion tokens.
 */
const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      className,
      appearance,
      gap = false,
      height,
      size,
      style,
      track = "neutral",
      value,
      parts,
      max = 100,
      label,
      ...props
    },
    ref
  ) => {
    const done =
      parts === undefined ? (value ?? 0) : parts.reduce((sum, part) => sum + part.value, 0);
    const percentage = Math.min(100, Math.max(0, (done / max) * 100));
    const sizeClass = height === undefined ? size : null;
    const trackStyle = height === undefined ? style : { height, ...style };
    // One sliding fill on the track, unless the bar has several fills or a gap.
    const segmented = parts !== undefined || gap;
    const fills = parts ?? [{ key: "value", value: value ?? 0, appearance: appearance ?? "brand" }];
    const shares = fillShares(fills, max);
    const lastFill = shares.fills.reduce((last, share, index) => (share > 0 ? index : last), -1);
    const motion = "transition-[flex-grow] duration-overlay ease-standard";

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
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label}
          className={
            segmented
              ? cn(
                  progressTrackVariants({ size: sizeClass }),
                  "flex",
                  gap ? "gap-ds-050" : TRACK_LOOKS[track]
                )
              : cn(progressTrackVariants({ size: sizeClass }), TRACK_LOOKS[track])
          }
          style={trackStyle}
          {...props}
        >
          {segmented ? (
            <>
              {fills.map((fill, index) =>
                (shares.fills[index] ?? 0) > 0 ? (
                  <div
                    key={fill.key}
                    className={cn(
                      progressBarVariants({ appearance: fill.appearance }),
                      "basis-ds-0",
                      motion,
                      // Flush fills share the track's round start; the last one ends round.
                      !gap && (index === lastFill ? "rounded-s-none" : "rounded-none")
                    )}
                    style={{ flexGrow: shares.fills[index] }}
                  />
                ) : null
              )}
              {shares.rest > 0 ? (
                <div
                  className={cn(
                    "h-full basis-ds-0",
                    motion,
                    gap && cn("rounded-full", TRACK_LOOKS[track])
                  )}
                  style={{ flexGrow: shares.rest }}
                />
              ) : null}
            </>
          ) : (
            <div
              className={cn(progressBarVariants({ appearance }))}
              style={{ transform: `translateX(-${100 - percentage}%)` }}
            />
          )}
        </div>
      </div>
    );
  }
);
ProgressBar.displayName = "ProgressBar";

export { ProgressBar, progressBarVariants };
export type { ProgressBarPart, ProgressBarProps };
