import * as React from "react";

import { svgId } from "./plot.paint";
import {
  createPlotScale,
  nearestStop,
  type PlotScale,
  type PlotScaleConfig,
  type PlotValue
} from "./plot.scales";
import { cn } from "../../lib/cn";
import { ChartTable, type ChartTableRow } from "../composed/chart.table";

/** The space between the plot's edge and its drawing area, in pixels. */
export interface PlotMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The data as a table for screen readers: one row per point, one column per series. */
export interface PlotTable {
  columns: string[];
  rows: ChartTableRow[];
}

/** Keyboard and pointer selection of one point, such as one day of a trend. */
export interface PlotScrub {
  /** The x value of each point that can be selected, in order. */
  stops: readonly PlotValue[];
  /** The selected point, as an index into `stops`. */
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Names the plot as a control, such as "Pick a day". */
  label: string;
  /** Says the selected point for assistive technology, such as "June 22: average $322". */
  describe: (index: number) => string;
}

/** What marks and overlays read from the plot around them. */
export interface PlotContextValue {
  width: number;
  height: number;
  /** The drawing area inside the margins, in pixels from the plot's top left corner. */
  inner: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  x: PlotScale | undefined;
  y: PlotScale | undefined;
  /** A prefix for SVG ids that is unique on the page. */
  id: string;
}

const PlotContext = React.createContext<PlotContextValue | null>(null);

/** The plot around a mark: its size, drawing area, and scales. */
export function usePlot(): PlotContextValue {
  const plot = React.useContext(PlotContext);
  if (plot === null) throw new Error("Plot marks and overlays must render inside a <Plot>.");
  return plot;
}

export interface PlotProps {
  /** Names the plot; assistive technology announces it as the figure name. */
  title: string;
  /** Keeps the title for screen readers only, for a plot under its own visible heading. */
  hideTitle?: boolean;
  className?: string;
  /** The plot height in pixels; the width follows the container. */
  height: number;
  /** The space around the drawing area; marks may draw into it, such as round line caps. */
  margin?: Partial<PlotMargin>;
  /** The horizontal scale. Its range runs from the left margin to the right one. */
  x?: PlotScaleConfig;
  /** The vertical scale. A value scale runs from the bottom up; a band scale from the top down. */
  y?: PlotScaleConfig;
  /** The data as text (A11Y-7); the drawing is hidden from assistive technology. */
  table: PlotTable;
  /** SVG marks, painted in order: the first sits at the back. */
  children?: React.ReactNode;
  /** HTML over the plot, such as a tooltip; it reads the scales but takes no pointer events. */
  overlay?: React.ReactNode;
  /** Lets people pick a point with the arrow keys and the pointer. */
  scrub?: PlotScrub;
}

const NO_MARGIN: PlotMargin = { top: 0, right: 0, bottom: 0, left: 0 };

/** The width of an element: read at once, so the first paint has marks, then kept current. */
function useWidth(): [number, React.RefCallback<HTMLDivElement>] {
  const [width, setWidth] = React.useState(0);
  const measure = React.useCallback((element: HTMLDivElement | null) => {
    if (element === null) return undefined;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [width, measure];
}

const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1
};

/**
 * The frame of a custom chart: a titled figure that measures its width, holds explicit margins,
 * and gives d3 scales to the SVG marks and HTML overlays inside it. A visually hidden table gives
 * the data to assistive technology (A11Y-7). With `scrub`, the plot is a slider over its points:
 * the arrow keys, Home, and End move the selection, and so does the pointer.
 */
export function Plot({
  children,
  className,
  height,
  hideTitle = false,
  margin,
  overlay,
  scrub,
  table,
  title,
  x,
  y
}: PlotProps) {
  const titleId = React.useId();
  const [width, measure] = useWidth();
  const edges = { ...NO_MARGIN, ...margin };
  const inner = {
    left: edges.left,
    top: edges.top,
    right: width - edges.right,
    bottom: height - edges.bottom,
    width: Math.max(width - edges.left - edges.right, 0),
    height: Math.max(height - edges.top - edges.bottom, 0)
  };
  // Values grow upward; categories run down from the top, like a list.
  const yRange: readonly [number, number] =
    y?.type === "band" || y?.type === "point"
      ? [inner.top, inner.bottom]
      : [inner.bottom, inner.top];
  const plot: PlotContextValue = {
    width,
    height,
    inner,
    x: x === undefined ? undefined : createPlotScale(x, [inner.left, inner.right]),
    y: y === undefined ? undefined : createPlotScale(y, yRange),
    id: svgId(titleId)
  };

  const select = (index: number): void => {
    if (scrub === undefined) return;
    const next = Math.min(Math.max(index, 0), scrub.stops.length - 1);
    if (next !== scrub.selectedIndex) scrub.onSelect(next);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (scrub === undefined) return;
    const step = KEY_STEPS[event.key];
    if (event.key === "Home") select(0);
    else if (event.key === "End") select(scrub.stops.length - 1);
    else if (step !== undefined) select(scrub.selectedIndex + step);
    else return;
    event.preventDefault();
  };
  const onPointer = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (scrub === undefined || plot.x === undefined) return;
    const box = event.currentTarget.getBoundingClientRect();
    const index = nearestStop(plot.x, scrub.stops, event.clientX - box.left);
    if (index >= 0) select(index);
  };

  return (
    <figure aria-labelledby={titleId} className={cn("m-0 grid gap-ds-150", className)}>
      <figcaption id={titleId} className={hideTitle ? "sr-only" : "text-heading-xs text-ds-text"}>
        {title}
      </figcaption>
      <div
        ref={measure}
        className={cn(
          // `group/plot` lets an overlay show only while the plot is hovered or focused.
          "group/plot relative",
          scrub !== undefined &&
            "touch-pan-y rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ds-border-focused"
        )}
        style={{ height }}
        {...(scrub === undefined
          ? {}
          : {
              role: "slider",
              tabIndex: 0,
              "aria-label": scrub.label,
              "aria-orientation": "horizontal" as const,
              "aria-valuemin": 1,
              "aria-valuemax": scrub.stops.length,
              "aria-valuenow": scrub.selectedIndex + 1,
              "aria-valuetext": scrub.describe(scrub.selectedIndex),
              onKeyDown,
              onPointerDown: onPointer,
              onPointerMove: onPointer
            })}
      >
        {width > 0 ? (
          <PlotContext.Provider value={plot}>
            <svg
              aria-hidden="true"
              className="absolute inset-0 block overflow-visible"
              height={height}
              width={width}
            >
              {children}
            </svg>
            {overlay}
          </PlotContext.Provider>
        ) : null}
      </div>
      <ChartTable columns={table.columns} rows={table.rows} />
    </figure>
  );
}

export type { PlotScale, PlotScaleConfig, PlotValue } from "./plot.scales";
export type { PlotColor, PlotFill } from "./plot.paint";
