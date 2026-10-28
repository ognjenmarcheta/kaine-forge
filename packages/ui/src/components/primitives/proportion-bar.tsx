import * as React from "react";

import { cn } from "../../lib/cn";

/** A chart slot; segments without one take the slot of their position, in fixed order. */
type ProportionBarColor = "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5" | "chart-6";

const SEGMENT_FILLS: Record<ProportionBarColor, string> = {
  "chart-1": "bg-ds-chart-1",
  "chart-2": "bg-ds-chart-2",
  "chart-3": "bg-ds-chart-3",
  "chart-4": "bg-ds-chart-4",
  "chart-5": "bg-ds-chart-5",
  "chart-6": "bg-ds-chart-6"
};
const SEGMENT_ORDER = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6"] as const;
/** Segments past the sixth share the neutral; fold them into one "Other" segment instead. */
const OVERFLOW_FILL = "bg-ds-border-bold";

/** The bar thickness, from the theme's spacing steps: 4, 8, 12, or 20px. */
const TRACK_SIZES = {
  sm: "h-ds-050",
  md: "h-ds-100",
  lg: "h-ds-150",
  xl: "h-ds-250"
} as const;

interface ProportionBarSegment {
  key: string;
  /** The translated name of the part. */
  label: string;
  value: number;
  color?: ProportionBarColor;
}

interface ProportionBarProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  /** Names the bar for assistive technology, such as "Patients by species". */
  label: string;
  /** The parts of the whole, in order; each takes its share of the bar. */
  segments: readonly ProportionBarSegment[];
  /** Formats each value in the legend and in the text for screen readers. */
  valueFormatter?: (value: number) => string;
  /** Shows each part's name and value under the bar; without it they are for screen readers only. */
  legend?: boolean;
  /** @defaultValue "md" */
  size?: keyof typeof TRACK_SIZES;
}

function segmentFill(segment: ProportionBarSegment, position: number) {
  const color = segment.color ?? SEGMENT_ORDER[position];
  return color === undefined ? OVERFLOW_FILL : SEGMENT_FILLS[color];
}

/**
 * Parts of one whole as one horizontal bar, with a surface gap between the parts. The bar is a
 * picture; a list gives every part's name and value as text, visible with `legend`.
 */
const ProportionBar = React.forwardRef<HTMLElement, ProportionBarProps>(
  (
    { className, label, legend = false, segments, size = "md", valueFormatter = String, ...props },
    ref
  ) => (
    <figure
      ref={ref}
      aria-label={label}
      className={cn("m-0 grid gap-ds-150", className)}
      {...props}
    >
      <div aria-hidden="true" className={cn("flex gap-ds-025", TRACK_SIZES[size])}>
        {segments.map((segment, position) =>
          segment.value > 0 ? (
            <span
              key={segment.key}
              className={cn("basis-ds-0 rounded-full", segmentFill(segment, position))}
              style={{ flexGrow: segment.value }}
            />
          ) : null
        )}
      </div>
      <dl
        className={legend ? "m-0 flex flex-wrap gap-x-ds-200 gap-y-ds-050 text-body-sm" : "sr-only"}
      >
        {segments.map((segment, position) => (
          <div key={segment.key} className="flex items-center gap-ds-075">
            <dt className="flex items-center gap-ds-075 text-ds-text-subtle">
              <span
                aria-hidden="true"
                className={cn("size-ds-100 shrink-0 rounded-sm", segmentFill(segment, position))}
              />
              {segment.label}
            </dt>
            <dd className="m-0 font-medium tabular-nums text-ds-text">
              {valueFormatter(segment.value)}
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  )
);
ProportionBar.displayName = "ProportionBar";

export { ProportionBar };
export type { ProportionBarColor, ProportionBarProps, ProportionBarSegment };
