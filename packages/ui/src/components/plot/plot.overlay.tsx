import { useCallback, useState, type ReactNode } from "react";

import { usePlot } from "./plot";
import type { PlotValue } from "./plot.scales";
import { cn } from "../../lib/cn";
import { seriesColor, type ChartColor } from "../composed/chart.series";

export interface PlotAnchorProps {
  /** The x value of the anchor point. */
  x: PlotValue;
  /** The y value of the anchor point, or the top or bottom edge of the drawing area. */
  y: number | "top" | "bottom";
  /** Pixels from the anchor to the content's near corner: right of it, and down. */
  offset?: { x?: number; y?: number };
  /**
   * The side of the anchor that the content sits on. `"auto"` takes the right side while the
   * content fits there and the left side near the right edge, so it stays inside the plot.
   * @defaultValue "auto"
   */
  side?: "auto" | "right" | "left";
  className?: string;
  children: ReactNode;
}

/**
 * HTML placed at a data point, such as a tooltip or a pinned label. It follows the scales, takes
 * no pointer events, and is hidden from assistive technology: the plot's table and its
 * selected-point text carry the same data.
 */
export function PlotAnchor({ children, className, offset, side = "auto", x, y }: PlotAnchorProps) {
  const plot = usePlot();
  const [contentWidth, setContentWidth] = useState(0);
  // Measured when the content mounts, before paint, and again whenever its size changes, so it
  // never shows on the wrong side.
  const measure = useCallback((element: HTMLDivElement | null) => {
    if (element === null) return undefined;
    setContentWidth(element.offsetWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setContentWidth(element.offsetWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const left = plot.x?.position(x) ?? Number.NaN;
  const top =
    y === "top"
      ? plot.inner.top
      : y === "bottom"
        ? plot.inner.bottom
        : (plot.y?.position(y) ?? Number.NaN);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  const dx = offset?.x ?? 0;
  const onRight = side === "right" || (side === "auto" && left + dx + contentWidth <= plot.width);

  return (
    <div
      ref={measure}
      aria-hidden="true"
      className={cn("pointer-events-none absolute left-0 top-0 w-max", className)}
      style={{
        transform: onRight
          ? `translate(${left + dx}px, ${top + (offset?.y ?? 0)}px)`
          : `translate(${left - dx}px, ${top + (offset?.y ?? 0)}px) translateX(-100%)`
      }}
    >
      {children}
    </div>
  );
}

export type PlotTooltipProps = PlotAnchorProps;

/** A glassy card at a data point: a translucent overlay surface that blurs what is behind it. */
export function PlotTooltip({ children, className, ...anchor }: PlotTooltipProps) {
  return (
    <PlotAnchor
      {...anchor}
      className={cn(
        "grid gap-ds-075 rounded-overlay bg-ds-surface-overlay/85 px-ds-150 py-ds-100 text-body-sm text-ds-text shadow-overlay backdrop-blur-sm",
        className
      )}
    >
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
