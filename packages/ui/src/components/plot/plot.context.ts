import * as React from "react";

import type { PlotRing } from "./plot.interaction";
import type { PlotScale, PlotValue } from "./plot.scales";

/** The point that the plot shows, on the axis that holds the points. */
export interface PlotActiveStop {
  axis: "x" | "y";
  /** The stop value, such as the day. */
  value: PlotValue;
  /** Its pixel on that axis, from the plot's top left corner. */
  pixel: number;
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
  /**
   * The point that marks and overlays show: the one under the pointer, the keyboard, or a
   * touch, else the selected one (not with `rest: "none"`); null when there is none. A custom
   * mark rings it with `PLOT_RING` while `highlight` is true.
   */
  activeIndex: number | null;
  /** The pinned point, from a click, a tap, Enter, or Space; null when there is none. */
  selectedIndex: number | null;
  /** The active point as a stop on the x or y axis; null when none, or on a ring. */
  activeStop: PlotActiveStop | null;
  /**
   * Whether marks highlight the active point on their own. False on a plot with `scrub`, whose
   * caller draws the selection, and on a plot that cannot pick a point.
   */
  highlight: boolean;
  /** Whether marks tween to new data: false with `animate={false}` or reduced motion. */
  animate: boolean;
}

export const PlotContext = React.createContext<PlotContextValue | null>(null);

/** The plot around a mark: its size, drawing area, scales, and active and selected points. */
export function usePlot(): PlotContextValue {
  const plot = React.useContext(PlotContext);
  if (plot === null) throw new Error("Plot marks and overlays must render inside a <Plot>.");
  return plot;
}

/**
 * What a plot shares with its own marks but not with callers: where marks report the points
 * they draw, so the plot can pick among them, and where overlays find the active point.
 */
export interface PlotRegistry {
  /** The plot's box, whose motion tokens set the pace of its tweens. */
  element: React.RefObject<HTMLDivElement | null>;
  /** The axis that holds the points, or `"ring"`; null on a plot that cannot pick a point. */
  stopAxis: "x" | "y" | "ring" | null;
  /** The axis whose values marks report, when the plot finds its points from them; else null. */
  wantsStops: "x" | "y" | null;
  /** Reports the stop-axis values of one mark; null removes them. */
  registerStops: (key: string, values: readonly PlotValue[] | null) => void;
  /** Reports the ring of a radial mark; null removes it. */
  registerRing: (key: string, ring: PlotRing | null) => void;
  /** The pixel point where an overlay for point `index` anchors, or null. */
  anchorOf: (index: number) => { x: number; y: number } | null;
}

export const PlotRegistryContext = React.createContext<PlotRegistry | null>(null);

const NO_REGISTRY: PlotRegistry = {
  element: { current: null },
  stopAxis: null,
  wantsStops: null,
  registerStops: () => undefined,
  registerRing: () => undefined,
  anchorOf: () => null
};

export function usePlotRegistry(): PlotRegistry {
  return React.useContext(PlotRegistryContext) ?? NO_REGISTRY;
}

/** Reports a mark's values on the axis the plot asks for, while it finds its points from them. */
export function useStopValues(valuesOn: (axis: "x" | "y") => readonly PlotValue[]): void {
  const { registerStops, wantsStops } = usePlotRegistry();
  const key = React.useId();
  const values = wantsStops === null ? [] : valuesOn(wantsStops);
  // The values as text, so a new array with the same values reports nothing new.
  const text = values.map(String).join("|");
  const latest = React.useRef(values);
  latest.current = values;
  React.useLayoutEffect(() => {
    if (wantsStops === null) return undefined;
    registerStops(key, latest.current);
    return () => registerStops(key, null);
  }, [key, wantsStops, text, registerStops]);
}
