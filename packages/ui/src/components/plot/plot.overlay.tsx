import { useCallback, useRef, useState, type ReactNode } from "react";

import { usePlot, usePlotRegistry } from "./plot.context";
import { PLOT_TOOLTIP_CLASS } from "./plot.paint";
import type { PlotValue } from "./plot.scales";
import { cn } from "../../lib/cn";
import { seriesColor, type ChartColor } from "../composed/chart.series";

export interface PlotAnchorProps {
  /**
   * The x value of the anchor point. Leave it out to follow the active point, or pass a function
   * of the point index; on a ring the anchor sits just outside the active slice.
   */
  x?: PlotValue | ((index: number) => PlotValue);
  /**
   * The y value of the anchor point, the top or bottom edge of the drawing area, or a function of
   * the point index. By default the top edge, or the active row on a plot of rows.
   */
  y?: number | "top" | "bottom" | ((index: number) => number);
  /** Pixels from the anchor to the content's near corner: right of it, and down. */
  offset?: { x?: number; y?: number };
  /**
   * The side of the anchor that the content sits on. `"auto"` takes the right side while the
   * content fits there and the left side near the right edge; near the bottom edge it moves
   * above the anchor, so it stays inside the plot.
   * @defaultValue "auto"
   */
  side?: "auto" | "right" | "left";
  /**
   * Moves to a new point with a transform transition and fades in and out (`duration-control`,
   * `duration-overlay`, `ease-standard`). @defaultValue true for an anchor that follows the
   * active point and for `PlotTooltip`
   */
  animate?: boolean;
  className?: string;
  /** The content, or a function that renders it for a point index, which follows the active point. */
  children: ReactNode | ((index: number) => ReactNode);
}

/** The content's box, measured before paint and again whenever its size changes. */
function useSize(): [{ width: number; height: number }, (element: HTMLDivElement | null) => void] {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const measure = useCallback((element: HTMLDivElement | null) => {
    if (element === null) return undefined;
    const read = () => setSize({ width: element.offsetWidth, height: element.offsetHeight });
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [size, measure];
}

/**
 * HTML placed at a data point, such as a tooltip or a pinned label. It follows the scales, takes
 * no pointer events, and is hidden from assistive technology: the plot's table and its
 * active-point text carry the same data. Without `x`, or with a function for `x`, `y`, or the
 * content, it follows the active point and hides while there is none.
 */
export function PlotAnchor({
  animate,
  children,
  className,
  offset,
  side = "auto",
  x,
  y
}: PlotAnchorProps) {
  const plot = usePlot();
  const registry = usePlotRegistry();
  const [size, measure] = useSize();
  const follows =
    x === undefined ||
    typeof x === "function" ||
    typeof y === "function" ||
    typeof children === "function";
  // The last active point, so the content keeps its place and text while it fades out.
  const last = useRef<number | null>(null);
  if (plot.activeIndex !== null) last.current = plot.activeIndex;
  const index = follows ? last.current : null;
  if (follows && index === null) return null;
  const point = index ?? 0;
  const base = follows ? registry.anchorOf(point) : null;
  const left =
    typeof x === "function"
      ? (plot.x?.position(x(point)) ?? Number.NaN)
      : x === undefined
        ? (base?.x ?? Number.NaN)
        : (plot.x?.position(x) ?? Number.NaN);
  const top =
    typeof y === "function"
      ? (plot.y?.position(y(point)) ?? Number.NaN)
      : y === "bottom"
        ? plot.inner.bottom
        : y === "top"
          ? plot.inner.top
          : typeof y === "number"
            ? (plot.y?.position(y) ?? Number.NaN)
            : (base?.y ?? plot.inner.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  const dx = offset?.x ?? 0;
  const dy = offset?.y ?? 0;
  const fitsRight = left + dx + size.width <= plot.width;
  const fitsLeft = left - dx - size.width >= 0;
  // The content stays inside the plot: the other side near an edge, else clamped to the edge.
  const horizontal =
    side === "right" || (side === "auto" && fitsRight)
      ? `translateX(${left + dx}px)`
      : side === "left" || fitsLeft
        ? `translateX(${left - dx}px) translateX(-100%)`
        : `translateX(${Math.max(Math.min(left + dx, plot.width - size.width), 0)}px)`;
  const fitsBelow = top + dy + size.height <= plot.height;
  const vertical =
    side !== "auto" || fitsBelow
      ? `translateY(${top + dy}px)`
      : top - Math.abs(dy) - size.height >= 0
        ? `translateY(${top - Math.abs(dy)}px) translateY(-100%)`
        : `translateY(${Math.max(plot.height - size.height, 0)}px)`;
  const content = typeof children === "function" ? children(point) : children;
  const moving = animate ?? follows;
  const hidden = follows && plot.activeIndex === null;

  if (!moving) {
    return (
      <div
        ref={measure}
        aria-hidden="true"
        className={cn("pointer-events-none absolute left-0 top-0 w-max", className)}
        style={{ transform: `${horizontal} ${vertical}` }}
      >
        {content}
      </div>
    );
  }
  return (
    <div
      ref={measure}
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 w-max transition-transform duration-control ease-standard"
      style={{ transform: `${horizontal} ${vertical}` }}
    >
      <div
        className={cn(
          "transition-opacity duration-overlay ease-standard starting:opacity-0",
          hidden && "opacity-0",
          className
        )}
      >
        {content}
      </div>
    </div>
  );
}

export type PlotTooltipProps = PlotAnchorProps;

/**
 * A glassy card at a data point: a translucent overlay surface that blurs what is behind it. It
 * moves and fades with the motion tokens; without `x` it follows the active point.
 */
export function PlotTooltip({ animate = true, children, className, ...anchor }: PlotTooltipProps) {
  return (
    <PlotAnchor {...anchor} animate={animate} className={cn(PLOT_TOOLTIP_CLASS, className)}>
      {children}
    </PlotAnchor>
  );
}

/** One legend entry: a series name and the mark that draws it. */
export interface PlotLegendItem {
  key: string;
  label: string;
  color: ChartColor;
  /** @defaultValue "line" */
  mark?: "line" | "square" | "dot";
}

/**
 * The series names beside their marks. Visual identity only: the plot's table gives assistive
 * technology the same names, so the list is hidden from it.
 */
export function PlotLegend({ className, items }: { className?: string; items: PlotLegendItem[] }) {
  return (
    <ul
      aria-hidden="true"
      className={cn(
        "m-0 flex list-none flex-wrap items-center gap-x-ds-200 gap-y-ds-050 p-0 text-body-sm text-ds-text-subtle",
        className
      )}
    >
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-ds-075">
          <span
            className={cn(
              "shrink-0",
              (item.mark ?? "line") === "line" && "h-ds-025 w-ds-200 rounded-full",
              item.mark === "square" && "size-ds-100 rounded-sm",
              item.mark === "dot" && "size-ds-100 rounded-full",
              seriesColor(0, item.color).swatch
            )}
          />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
