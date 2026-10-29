import * as React from "react";

import {
  PlotContext,
  PlotRegistryContext,
  type PlotActiveStop,
  type PlotContextValue,
  type PlotRegistry
} from "./plot.context";
import {
  activeOf,
  describeRow,
  keyPick,
  nextPick,
  sliceAnchor,
  sliceAt,
  type PlotPick,
  type PlotPickEvent,
  type PlotPickMode,
  type PlotRing
} from "./plot.interaction";
import { usePrefersReducedMotion } from "./plot.motion";
import { svgId } from "./plot.paint";
import {
  createPlotScale,
  nearestStop,
  spanAt,
  type PlotScale,
  type PlotScaleConfig,
  type PlotValue
} from "./plot.scales";
import { PlotTableTooltip } from "./plot.table-tooltip";
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

/**
 * Keyboard and pointer selection of one point, such as one day of a trend. The selection
 * follows the pointer and the arrow keys, and the caller draws it; marks do not highlight the
 * point on their own. For a plot that highlights by itself and pins on click, use `interaction`.
 */
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

/**
 * How people pick a point. Every plot with points does this by default; pass this to tune it.
 * Hover, focus, or touch makes a point *active*; a click, a tap, Enter, or Space pins it as
 * *selected*. When the pointer leaves, the selected point shows again, or none.
 */
export interface PlotInteraction {
  /**
   * The value of each point on the axis that holds them, in order. By default the categories of
   * a band or point scale, else the values the marks draw, or the slices of a `PlotArcs` ring.
   */
  stops?: readonly PlotValue[];
  /**
   * The axis that holds the points. By default `"y"` when only the y scale has categories, as in
   * a list of rows, else `"x"`.
   */
  axis?: "x" | "y";
  /** Names the plot as a control. @defaultValue the title */
  label?: string;
  /** Says a point for assistive technology and the default tooltip. By default its table row. */
  describe?: (index: number) => string;
  /** The pinned point; set it, with `onSelectedChange`, to control the selection. */
  selectedIndex?: number | null;
  /** The pinned point at first, when the selection is not controlled. @defaultValue null */
  defaultSelectedIndex?: number | null;
  onSelectedChange?: (index: number | null) => void;
  /** Called when the active point changes: hover, focus, touch, or the selection. */
  onActiveChange?: (index: number | null) => void;
  /**
   * The extent of each point on the axis that holds them, from its start to its end, such as
   * the parts of a stacked bar. The pointer then picks the point whose extent it is over, so a
   * short part next to a long one gets the pixels it covers; elsewhere it picks the nearest
   * point. By default the stops are the middles of the extents.
   */
  spans?: readonly (readonly [number, number])[];
  /**
   * What the pinned point shows while nobody points at, touches, or focuses the plot. `"all"`:
   * its highlight and its tooltip. `"highlight"`: its highlight, and its tooltip only once
   * people used this plot since the selection last changed elsewhere, for plots that share one
   * selection. `"none"`: neither, for a pinned mark that has its own look; the active point is
   * then only the one under the pointer, the keyboard, or a touch.
   * @defaultValue "all"
   */
  rest?: "all" | "highlight" | "none";
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
  /**
   * The data as text (A11Y-7); the drawing is hidden from assistive technology. With one row per
   * point, it also says the active point and fills the default tooltip.
   */
  table: PlotTable;
  /** SVG marks, painted in order: the first sits at the back. */
  children?: React.ReactNode;
  /** HTML over the plot, such as a tooltip; it reads the scales but takes no pointer events. */
  overlay?: React.ReactNode;
  /**
   * Lets people pick a point with the arrow keys and the pointer, and the caller draws the
   * selection. It stands for `interaction` with a selection that follows the pointer.
   */
  scrub?: PlotScrub;
  /**
   * How people pick a point. By default a plot whose table has one row per point is a slider
   * over its points: marks highlight the active one and a tooltip shows its row. `false` keeps
   * the plot still, such as a sparkline whose tile shows the value.
   */
  interaction?: PlotInteraction | false;
  /**
   * The tooltip at the active point: `true` shows its table row, a function renders the content
   * for a point index. @defaultValue true when the plot has no `overlay`
   */
  tooltip?: boolean | ((index: number) => React.ReactNode);
  /**
   * Tweens marks to new data with the motion tokens. Under reduced motion values always snap.
   * @defaultValue true
   */
  animate?: boolean;
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

const isCategorical = (config: PlotScaleConfig | undefined): boolean =>
  config?.type === "band" || config?.type === "point";

/** The stops that marks report, in pixel order, one per pixel. */
function markedStops(
  marked: ReadonlyMap<string, readonly PlotValue[]>,
  scale: PlotScale | undefined
): PlotValue[] {
  if (scale === undefined) return [];
  const placed = [...marked.values()]
    .flat()
    .map((value) => ({ value, pixel: scale.position(value) }))
    .filter(({ pixel }) => Number.isFinite(pixel))
    .sort((a, b) => a.pixel - b.pixel);
  return placed
    .filter((stop, index) => index === 0 || stop.pixel - (placed[index - 1]?.pixel ?? 0) >= 0.5)
    .map(({ value }) => value);
}

/** How the plot picks points: from `scrub`, from `interaction`, or the default. */
interface PickConfig extends PlotInteraction {
  mode: PlotPickMode;
  /** The caller asked for picking, so the plot picks even without a table row per point. */
  explicit: boolean;
}

function pickConfig(
  scrub: PlotScrub | undefined,
  interaction: PlotInteraction | false | undefined
): PickConfig | null {
  if (scrub !== undefined) {
    return {
      mode: "follow",
      explicit: true,
      stops: scrub.stops,
      label: scrub.label,
      describe: scrub.describe,
      selectedIndex: scrub.selectedIndex,
      onSelectedChange: (index) => {
        if (index !== null) scrub.onSelect(index);
      }
    };
  }
  if (interaction === false) return null;
  return { mode: "pin", explicit: interaction !== undefined, ...interaction };
}

/**
 * The frame of a custom chart: a titled figure that measures its width, holds explicit margins,
 * and gives d3 scales to the SVG marks and HTML overlays inside it. A visually hidden table gives
 * the data to assistive technology (A11Y-7).
 *
 * A plot with points is a slider over them (DATA-5): the pointer and the arrow keys, Home, and
 * End move the active point, and a click, a tap, Enter, or Space pins it. Marks highlight the
 * active point and a tooltip shows its table row, without wiring. Marks tween to new data with
 * the motion tokens and snap under reduced motion.
 */
export function Plot({
  animate = true,
  children,
  className,
  height,
  hideTitle = false,
  interaction,
  margin,
  overlay,
  scrub,
  table,
  title,
  tooltip,
  x,
  y
}: PlotProps) {
  const titleId = React.useId();
  const [width, measure] = useWidth();
  const element = React.useRef<HTMLDivElement | null>(null);
  const box = React.useCallback(
    (node: HTMLDivElement | null) => {
      element.current = node;
      return measure(node);
    },
    [measure]
  );
  const reducedMotion = usePrefersReducedMotion();
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
  const xScale = x === undefined ? undefined : createPlotScale(x, [inner.left, inner.right]);
  const yScale = y === undefined ? undefined : createPlotScale(y, yRange);

  // The points: given, the slices of a ring, the categories of the axis, or the marks' values.
  const config = pickConfig(scrub, interaction);
  const [marked, setMarked] = React.useState<ReadonlyMap<string, readonly PlotValue[]>>(
    () => new Map()
  );
  const [rings, setRings] = React.useState<ReadonlyMap<string, PlotRing>>(() => new Map());
  const registerStops = React.useCallback((key: string, values: readonly PlotValue[] | null) => {
    setMarked((previous) => {
      const next = new Map(previous);
      if (values === null) next.delete(key);
      else next.set(key, values);
      return next;
    });
  }, []);
  const registerRing = React.useCallback((key: string, ring: PlotRing | null) => {
    setRings((previous) => {
      const next = new Map(previous);
      if (ring === null) next.delete(key);
      else next.set(key, ring);
      return next;
    });
  }, []);
  const axis = config?.axis ?? (isCategorical(y) && !isCategorical(x) ? "y" : "x");
  const axisScale = axis === "x" ? xScale : yScale;
  const spans = config?.spans;
  // The first ring a mark reports holds the slices.
  const ring =
    config?.stops === undefined && spans === undefined ? [...rings.values()][0] : undefined;
  const wantsStops =
    config !== null &&
    config.stops === undefined &&
    spans === undefined &&
    ring === undefined &&
    !isCategorical(axis === "x" ? x : y);
  const stops: readonly PlotValue[] =
    config === null || ring !== undefined
      ? []
      : (config.stops ??
        spans?.map(([from, to]) => (from + to) / 2) ??
        (wantsStops ? markedStops(marked, axisScale) : (axisScale?.ticks() ?? [])));
  const count =
    ring !== undefined ? ring.slices.length : axisScale === undefined ? 0 : stops.length;
  const describe =
    config?.describe ??
    ((index: number) => describeRow(table, index) ?? String(stops[index] ?? index + 1));
  const interactive =
    config !== null && count > 0 && (config.explicit || table.rows.length === count);
  const stopAxis = !interactive ? null : ring !== undefined ? "ring" : axis;
  const mode = config?.mode ?? "pin";
  const rest = config?.rest ?? "all";
  /** The point that marks and overlays show: with `rest: "none"`, never the pinned one at rest. */
  const shownOf = (state: PlotPick): number | null =>
    rest === "none" ? state.transient : activeOf(state);

  // The active and selected points.
  const [transient, setTransient] = React.useState<number | null>(null);
  const [ownSelected, setOwnSelected] = React.useState<number | null>(
    config?.defaultSelectedIndex ?? null
  );
  const controlled = config?.selectedIndex !== undefined;
  const inRange = (index: number | null | undefined): number | null =>
    index !== null && index !== undefined && index >= 0 && index < count ? index : null;
  const pick: PlotPick = {
    transient: inRange(transient),
    selected: inRange(controlled ? config?.selectedIndex : ownSelected)
  };
  const latest = React.useRef(pick);
  latest.current = pick;
  const active = interactive ? shownOf(pick) : null;

  // The selection when people last used this plot; a selection made elsewhere clears it.
  const [usedAt, setUsedAt] = React.useState<{ selected: number | null } | null>(null);
  const [seenSelected, setSeenSelected] = React.useState(pick.selected);
  if (rest === "highlight" && seenSelected !== pick.selected) {
    setSeenSelected(pick.selected);
    if (usedAt !== null && usedAt.selected !== pick.selected) setUsedAt(null);
  }
  const used = usedAt !== null && usedAt.selected === pick.selected;

  const dispatch = (...events: PlotPickEvent[]): void => {
    if (config === null || !interactive) return;
    const before = latest.current;
    const after = events.reduce((state, event) => nextPick(state, event, { count, mode }), before);
    latest.current = after;
    if (after.transient !== before.transient) setTransient(after.transient);
    if (rest === "highlight" && events.some((event) => event.type !== "leave")) {
      setUsedAt((previous) =>
        previous?.selected === after.selected ? previous : { selected: after.selected }
      );
    }
    if (after.selected !== before.selected) {
      if (!controlled) setOwnSelected(after.selected);
      config.onSelectedChange?.(after.selected);
    }
    if (shownOf(after) !== shownOf(before)) config.onActiveChange?.(shownOf(after));
  };
  const hit = (event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - bounds.left;
    const py = event.clientY - bounds.top;
    if (ring !== undefined) return sliceAt(ring, px, py);
    if (axisScale === undefined) return -1;
    const pixel = axis === "x" ? px : py;
    const inside = spans === undefined ? -1 : spanAt(axisScale, spans, pixel);
    // On a band scale the nearest band center is the band under the pointer.
    return inside >= 0 ? inside : nearestStop(axisScale, stops, pixel);
  };
  const onPointer = (event: React.PointerEvent<HTMLDivElement>): void => {
    const index = hit(event);
    dispatch(index >= 0 ? { type: "point", index } : { type: "leave" });
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const pickEvent = keyPick(event.key, stopAxis ?? "x");
    if (pickEvent === null) return;
    // Escape with nothing to hide stays with the page, such as a dialog that closes on it.
    if (pickEvent.type === "dismiss" && activeOf(latest.current) === null) return;
    event.preventDefault();
    dispatch(pickEvent);
  };

  const stopPixel = (index: number): number =>
    axisScale?.position(stops[index] ?? Number.NaN) ?? Number.NaN;
  const activeStop: PlotActiveStop | null =
    active === null || stopAxis === null || stopAxis === "ring"
      ? null
      : { axis: stopAxis, value: stops[active] ?? Number.NaN, pixel: stopPixel(active) };
  const plot: PlotContextValue = {
    width,
    height,
    inner,
    x: xScale,
    y: yScale,
    id: svgId(titleId),
    activeIndex: active,
    selectedIndex: interactive ? pick.selected : null,
    activeStop,
    highlight: interactive && mode === "pin",
    animate: animate && !reducedMotion
  };
  const registry: PlotRegistry = {
    element,
    stopAxis,
    wantsStops: wantsStops ? axis : null,
    registerStops,
    registerRing,
    anchorOf: (index) => {
      if (stopAxis === "ring" && ring !== undefined) return sliceAnchor(ring, index);
      const pixel = stopPixel(index);
      if (!Number.isFinite(pixel)) return null;
      return stopAxis === "y" ? { x: inner.right, y: pixel } : { x: pixel, y: inner.top };
    }
  };
  const showTooltip = interactive && (tooltip ?? overlay === undefined) !== false;
  // The tooltip of a plot that shares its selection waits until people use this plot.
  const tooltipIndex = rest === "highlight" && pick.transient === null && !used ? null : active;
  const shownIndex = activeOf(pick) ?? 0;

  return (
    <figure aria-labelledby={titleId} className={cn("m-0 grid gap-ds-150", className)}>
      <figcaption id={titleId} className={hideTitle ? "sr-only" : "text-heading-xs text-ds-text"}>
        {title}
      </figcaption>
      <div
        ref={box}
        className={cn(
          // `group/plot` lets an overlay show only while the plot is hovered or focused.
          "group/plot relative",
          interactive &&
            "touch-pan-y rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ds-border-focused"
        )}
        style={{ height }}
        {...(!interactive
          ? {}
          : {
              role: "slider",
              tabIndex: 0,
              "aria-label": config?.label ?? title,
              "aria-orientation":
                stopAxis === "y" ? ("vertical" as const) : ("horizontal" as const),
              "aria-valuemin": 1,
              "aria-valuemax": count,
              "aria-valuenow": shownIndex + 1,
              "aria-valuetext": describe(shownIndex),
              onKeyDown,
              onPointerDown: onPointer,
              onPointerMove: onPointer,
              onPointerLeave: () => dispatch({ type: "leave" }),
              onClick: (event: React.MouseEvent<HTMLDivElement>) => {
                const index = hit(event);
                if (index >= 0) dispatch({ type: "point", index }, { type: "commit" });
              },
              onFocus: () => dispatch({ type: "focus" }),
              onBlur: () => dispatch({ type: "leave" })
            })}
      >
        {width > 0 ? (
          <PlotContext.Provider value={plot}>
            <PlotRegistryContext.Provider value={registry}>
              <svg
                aria-hidden="true"
                className="absolute inset-0 block overflow-visible"
                height={height}
                width={width}
              >
                {children}
              </svg>
              {overlay}
              {showTooltip ? (
                <PlotContext.Provider
                  value={tooltipIndex === active ? plot : { ...plot, activeIndex: tooltipIndex }}
                >
                  <PlotTableTooltip
                    describe={describe}
                    render={typeof tooltip === "function" ? tooltip : undefined}
                    table={table}
                  />
                </PlotContext.Provider>
              ) : null}
            </PlotRegistryContext.Provider>
          </PlotContext.Provider>
        ) : null}
      </div>
      <ChartTable columns={table.columns} rows={table.rows} />
    </figure>
  );
}

export { usePlot } from "./plot.context";
export type { PlotActiveStop, PlotContextValue } from "./plot.context";
export type { PlotScale, PlotScaleConfig, PlotValue } from "./plot.scales";
export type { PlotColor, PlotFill } from "./plot.paint";
