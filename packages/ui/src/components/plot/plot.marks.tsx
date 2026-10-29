import { scaleBand } from "d3-scale";
import {
  arc,
  curveBasis,
  curveCatmullRom,
  curveLinear,
  curveMonotoneX,
  curveNatural,
  curveStep,
  curveStepAfter,
  curveStepBefore,
  line,
  type CurveFactory
} from "d3-shape";
import * as React from "react";

import { usePlot, usePlotRegistry, useStopValues, type PlotContextValue } from "./plot.context";
import { sliceAngles, type PlotRing } from "./plot.interaction";
import { useTween, type PlotPace, type PlotTweenFrame, type PlotTweenOptions } from "./plot.motion";
import { paintFill, PLOT_RING, plotColor, type PlotColor, type PlotFill } from "./plot.paint";
import type { PlotScale, PlotValue } from "./plot.scales";
import { cn } from "../../lib/cn";

/** Reads one value of a datum, such as its date or its price. */
export type PlotAccessor<Datum, Value> = (datum: Datum, index: number) => Value;

/** How a line passes through its points. `"monotone"` stays smooth without overshooting them. */
export type PlotCurve =
  | "linear"
  | "monotone"
  | "natural"
  | "catmull-rom"
  | "basis"
  | "step"
  | "step-after"
  | "step-before";

const CURVES: Record<PlotCurve, CurveFactory> = {
  linear: curveLinear,
  monotone: curveMonotoneX,
  natural: curveNatural,
  "catmull-rom": curveCatmullRom,
  basis: curveBasis,
  step: curveStep,
  "step-after": curveStepAfter,
  "step-before": curveStepBefore
};

/** One series of points: its data and how to read x and y from each datum. */
export interface PlotSeries<Datum> {
  data: readonly Datum[];
  x: PlotAccessor<Datum, PlotValue>;
  y: PlotAccessor<Datum, number>;
}

/** The stroke of a line mark. */
export interface PlotStroke {
  /** @defaultValue "chart-1" */
  color?: PlotColor;
  /** In pixels. @defaultValue 2 */
  width?: number;
  /** An SVG dash pattern, such as `"0 6"` for round dots with a round cap. */
  dash?: string;
  /** @defaultValue "round" */
  cap?: "round" | "butt" | "square";
  /** @defaultValue 1 */
  opacity?: number;
}

function strokeProps({
  cap = "round",
  color = "chart-1",
  dash,
  opacity = 1,
  width = 2
}: PlotStroke) {
  return {
    stroke: plotColor(color),
    strokeWidth: width,
    strokeLinecap: cap,
    strokeLinejoin: "round" as const,
    strokeOpacity: opacity,
    ...(dash === undefined ? {} : { strokeDasharray: dash })
  };
}

/** The ring around an active bar or capsule (`PLOT_RING`), and how far outside the mark it sits. */
const ringProps = PLOT_RING.paint;
const RING_OFFSET = PLOT_RING.offset;

/** The x and y scales of the plot; a cartesian mark cannot draw without both. */
function useCartesian(mark: string): PlotContextValue & { x: PlotScale; y: PlotScale } {
  const plot = usePlot();
  const { x, y } = plot;
  if (x === undefined || y === undefined) {
    throw new Error(`${mark} needs a plot with both an x and a y scale.`);
  }
  return { ...plot, x, y };
}

/** A fill with its definition, under an id unique to this mark. */
function useFill(fill: PlotFill, key = "fill") {
  const { id } = usePlot();
  return paintFill(fill, `${id}-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}-${key}`);
}

/** How a mark's numbers tween; the plot sets the motion tokens and reduced motion. */
export interface PlotTweenConfig {
  /** `"overlay"` for data that changes, `"control"` for a mark that follows the pointer. @defaultValue "overlay" */
  pace?: PlotPace;
  /** A change of this key snaps instead of tweening, such as a new layout. A new plot size always snaps. */
  reset?: string;
  /**
   * Where a value that is new on a change of count starts, such as the baseline for a new bar's
   * top. Without it a change of count cross-fades the old values into the new ones.
   */
  enter?: PlotTweenOptions["enter"];
  /**
   * A name for each number, so a number tweens from the old number of the same name: marks that
   * change order, such as sorted bars, move to their new places.
   */
  keys?: PlotTweenOptions["keys"];
}

export type { PlotPace, PlotTweenFrame } from "./plot.motion";

/**
 * Tweens a custom mark's numbers, such as its pixel positions, the way the plot's own marks
 * move: on the motion tokens, from what is on screen, and snapping under reduced motion, with
 * `animate={false}`, and on a new plot size. Draw `values` each frame; when the number of values
 * changes and `enter` is not set, also draw `previous` at `1 - fade` and `values` at `fade`.
 */
export function usePlotTween(
  target: readonly number[],
  { enter, keys, pace, reset = "" }: PlotTweenConfig = {}
): PlotTweenFrame {
  const plot = usePlot();
  const { element } = usePlotRegistry();
  return useTween(target, {
    animate: plot.animate,
    element,
    reset: `${plot.width}x${plot.height} ${reset}`,
    ...(enter === undefined ? {} : { enter }),
    ...(keys === undefined ? {} : { keys }),
    ...(pace === undefined ? {} : { pace })
  });
}

/**
 * Whether a pixel point sits on the active stop, for a mark that highlights it. `highlight`
 * overrides the plot: `false` opts a mark out, `true` opts it in under `scrub`.
 */
function useActiveAt(highlight: boolean | undefined) {
  const { activeStop, highlight: plotHighlight } = usePlot();
  return (px: number, py: number): boolean =>
    (highlight ?? plotHighlight) &&
    activeStop !== null &&
    Math.abs((activeStop.axis === "x" ? px : py) - activeStop.pixel) < 0.5;
}

/** Reports the values of a series to the plot, which picks among them on a value axis. */
function useSeriesStops<Datum>(
  data: readonly Datum[],
  x: PlotAccessor<Datum, PlotValue>,
  y: PlotAccessor<Datum, PlotValue>
) {
  useStopValues((axis) => data.map((datum, index) => (axis === "x" ? x : y)(datum, index)));
}

/** Each datum as a pixel point, read with its own index; NaN where a value has no position. */
function pixelsOf<Datum>(
  series: PlotSeries<Datum>,
  x: PlotScale,
  y: PlotScale
): [number, number][] {
  return series.data.map((datum, index) => [
    x.position(series.x(datum, index)),
    y.position(series.y(datum, index))
  ]);
}

/** Flat numbers back into pixel points. */
function pairsOf(values: readonly number[]): [number, number][] {
  return Array.from({ length: Math.floor(values.length / 2) }, (_, index) => [
    values[index * 2] ?? Number.NaN,
    values[index * 2 + 1] ?? Number.NaN
  ]);
}

/** A curve through pixel points, broken where a point has no position. */
function pathThroughPixels(points: readonly [number, number][], curve: PlotCurve): string {
  return (
    line()
      .defined(([px, py]) => Number.isFinite(px) && Number.isFinite(py))
      .curve(CURVES[curve])(points) ?? ""
  );
}

/** While the count changes, the old shape fades out under the new one. */
function fadeOpacity(frame: { previous: readonly number[] | null; fade: number }) {
  return frame.previous === null ? undefined : frame.fade;
}

export interface PlotGridProps extends PlotStroke {
  /** `"y"` draws a horizontal line at each y value; `"x"` a vertical line at each x value. */
  axis: "x" | "y";
  /** The values to draw at; by default the scale's ticks. */
  values?: readonly PlotValue[];
  /** About how many ticks to draw when `values` is not set. @defaultValue 5 */
  count?: number;
}

/** Grid lines across the drawing area, solid or dashed. */
export function PlotGrid({ axis, count = 5, values, ...stroke }: PlotGridProps) {
  const { inner, x, y } = useCartesian("PlotGrid");
  const scale = axis === "x" ? x : y;
  const at = values ?? scale.ticks(count);
  const paint = strokeProps({ color: "grid", width: 1, cap: "butt", ...stroke });

  return (
    <g>
      {at.map((value, index) => {
        const pixel = scale.position(value);
        return axis === "x" ? (
          <line key={index} {...paint} x1={pixel} x2={pixel} y1={inner.top} y2={inner.bottom} />
        ) : (
          <line key={index} {...paint} x1={inner.left} x2={inner.right} y1={pixel} y2={pixel} />
        );
      })}
    </g>
  );
}

export interface PlotStemsProps<Datum> extends PlotStroke {
  data: readonly Datum[];
  x: PlotAccessor<Datum, PlotValue>;
  /** The top end of each stem; by default the top of the drawing area. */
  y?: PlotAccessor<Datum, number>;
  /** The value of the bottom end; by default the bottom of the drawing area. */
  y0?: number;
}

/** A vertical line at each datum, such as a drop line from a point or a dense run of stems. */
export function PlotStems<Datum>({ data, x, y, y0, ...stroke }: PlotStemsProps<Datum>) {
  const plot = useCartesian("PlotStems");
  useSeriesStops(data, x, y ?? (() => Number.NaN));
  const bottom = y0 === undefined ? plot.inner.bottom : plot.y.position(y0);
  const paint = strokeProps({ width: 1, ...stroke });

  return (
    <g>
      {data.map((datum, index) => {
        const pixel = plot.x.position(x(datum, index));
        const top = y === undefined ? plot.inner.top : plot.y.position(y(datum, index));
        return <line key={index} {...paint} x1={pixel} x2={pixel} y1={top} y2={bottom} />;
      })}
    </g>
  );
}

export interface PlotLineProps<Datum> extends PlotSeries<Datum>, PlotStroke {
  /** @defaultValue "linear" */
  curve?: PlotCurve;
  /**
   * Marks the line's point at the active stop with a dot in the line color, ringed with the
   * surface. `false` opts out. @defaultValue the plot's `highlight`
   */
  highlight?: boolean;
  /**
   * Continues the line from its first point to the left edge of the drawing area and from its
   * last point to the right edge, along its first and last segments, for a series that goes on
   * past the days the plot shows. @defaultValue false
   */
  extend?: boolean;
}

/** The value at `px` on the straight line through two pixel points; flat through one. */
function lineAt([ax, ay]: [number, number], [bx, by]: [number, number], px: number): number {
  return ax === bx ? ay : ay + ((by - ay) * (px - ax)) / (bx - ax);
}

/** Pixel points with the line continued to `left` and `right` along its end segments. */
function extendTo(points: [number, number][], left: number, right: number): [number, number][] {
  const placed = points.filter(([px, py]) => Number.isFinite(px) && Number.isFinite(py));
  const first = placed[0];
  const last = placed.at(-1);
  if (first === undefined || last === undefined) return points;
  const start: [number, number][] =
    first[0] > left ? [[left, lineAt(first, placed[1] ?? first, left)]] : [];
  const end: [number, number][] =
    last[0] < right ? [[right, lineAt(placed.at(-2) ?? last, last, right)]] : [];
  return [...start, ...points, ...end];
}

/** A line through a series, solid, dashed, or dotted. It tweens to new data. */
export function PlotLine<Datum>({
  curve = "linear",
  data,
  extend = false,
  highlight,
  x,
  y,
  ...stroke
}: PlotLineProps<Datum>) {
  const plot = useCartesian("PlotLine");
  useSeriesStops(data, x, y);
  const target = pixelsOf({ data, x, y }, plot.x, plot.y);
  const frame = usePlotTween(target.flat());
  const shown = pairsOf(frame.values);
  const activeAt = useActiveAt(highlight);
  const active = target.findIndex(([px, py]) => activeAt(px, py));
  const dot = shown[active];
  const paint = strokeProps(stroke);
  const through = (points: [number, number][]) =>
    pathThroughPixels(extend ? extendTo(points, plot.inner.left, plot.inner.right) : points, curve);

  return (
    <>
      {frame.previous === null ? null : (
        <path
          d={through(pairsOf(frame.previous))}
          fill="none"
          opacity={1 - frame.fade}
          {...paint}
        />
      )}
      <path d={through(shown)} fill="none" opacity={fadeOpacity(frame)} {...paint} />
      {dot === undefined || !dot.every(Number.isFinite) ? null : (
        <circle
          cx={dot[0]}
          cy={dot[1]}
          fill={plotColor(stroke.color ?? "chart-1")}
          r={Math.max(4, (stroke.width ?? 2) + 2)}
          stroke={plotColor("surface")}
          strokeWidth={2}
        />
      )}
    </>
  );
}

export interface PlotAreaProps<Datum> extends PlotSeries<Datum> {
  fill: PlotFill;
  /** The value of the baseline; by default the bottom of the drawing area. */
  y0?: number;
  /** @defaultValue "linear" */
  curve?: PlotCurve;
}

/** The closed shape between pixel points and a baseline. */
function areaPath(points: readonly [number, number][], baseline: number, curve: PlotCurve) {
  const top = pathThroughPixels(points, curve);
  const start = points[0]?.[0];
  const end = points.at(-1)?.[0];
  if (top === "" || start === undefined || end === undefined) return "";
  return `${top}L${end},${baseline}L${start},${baseline}Z`;
}

/** The area between a series and a baseline: flat, a gradient, or hatched. It tweens to new data. */
export function PlotArea<Datum>({ curve = "linear", data, fill, x, y, y0 }: PlotAreaProps<Datum>) {
  const plot = useCartesian("PlotArea");
  useSeriesStops(data, x, y);
  const paint = useFill(fill);
  const baseline = y0 === undefined ? plot.inner.bottom : plot.y.position(y0);
  const frame = usePlotTween([baseline, ...pixelsOf({ data, x, y }, plot.x, plot.y).flat()]);
  const shape = (values: readonly number[]) =>
    areaPath(pairsOf(values.slice(1)), values[0] ?? baseline, curve);
  const path = shape(frame.values);
  if (path === "") return null;

  return (
    <g>
      <defs>{paint.definition}</defs>
      {frame.previous === null ? null : (
        <path
          d={shape(frame.previous)}
          fill={paint.fill}
          fillOpacity={paint.fillOpacity}
          opacity={1 - frame.fade}
        />
      )}
      <path
        d={path}
        fill={paint.fill}
        fillOpacity={paint.fillOpacity}
        opacity={fadeOpacity(frame)}
      />
    </g>
  );
}

export interface PlotBandProps<Upper, Lower> {
  /** The top edge of the band. Its points need not share x values with `lower`. */
  upper: PlotSeries<Upper>;
  /** The bottom edge of the band. */
  lower: PlotSeries<Lower>;
  fill: PlotFill;
  /** @defaultValue "linear" */
  curve?: PlotCurve;
}

/** The area between two series, such as a price range or a forecast's spread. It tweens. */
export function PlotBand<Upper, Lower>({
  curve = "linear",
  fill,
  lower,
  upper
}: PlotBandProps<Upper, Lower>) {
  const plot = useCartesian("PlotBand");
  const paint = useFill(fill);
  const upperCount = upper.data.length;
  // A new split between the edges snaps: its values would not line up with the old ones.
  const frame = usePlotTween(
    [
      upperCount,
      ...pixelsOf(upper, plot.x, plot.y).flat(),
      ...pixelsOf(lower, plot.x, plot.y).flat()
    ],
    { reset: String(upperCount) }
  );
  const shape = (values: readonly number[]) => {
    const split = 1 + (values[0] ?? 0) * 2;
    const top = pathThroughPixels(pairsOf(values.slice(1, split)), curve);
    // The bottom edge runs back from right to left, which closes the shape; the curves are
    // symmetric, so the edge is the same line a forward pass would draw.
    // Each datum keeps its own index for the accessors; only the finished points run backward.
    const bottom = pathThroughPixels(pairsOf(values.slice(split)).reverse(), curve);
    return top === "" || bottom === "" ? "" : `${top}L${bottom.slice(1)}Z`;
  };
  const path = shape(frame.values);
  if (path === "") return null;

  return (
    <g>
      <defs>{paint.definition}</defs>
      {frame.previous === null ? null : (
        <path
          d={shape(frame.previous)}
          fill={paint.fill}
          fillOpacity={paint.fillOpacity}
          opacity={1 - frame.fade}
        />
      )}
      <path
        d={path}
        fill={paint.fill}
        fillOpacity={paint.fillOpacity}
        opacity={fadeOpacity(frame)}
      />
    </g>
  );
}

/**
 * Writes a bar's path in band and value coordinates: `u` across the band, `v` along the value
 * axis. Columns draw them as x and y; rows swap the two, which also turns each arc the other way.
 */
interface BarPen {
  point: (u: number, v: number) => string;
  /** A line along the value axis to `v`. */
  along: (v: number) => string;
  /** A line across the band to `u`. */
  across: (u: number) => string;
  sweep: (flag: 0 | 1) => 0 | 1;
}

const COLUMN_PEN: BarPen = {
  point: (u, v) => `${u},${v}`,
  along: (v) => `V${v}`,
  across: (u) => `H${u}`,
  sweep: (flag) => flag
};

const ROW_PEN: BarPen = {
  point: (u, v) => `${v},${u}`,
  along: (v) => `H${v}`,
  across: (u) => `V${u}`,
  sweep: (flag) => (flag === 1 ? 0 : 1)
};

/** A bar's path with its data end rounded by `radius`, from `base` to `end` in pixels. */
function barPath(
  left: number,
  width: number,
  end: number,
  base: number,
  radius: number,
  pen: BarPen = COLUMN_PEN
): string {
  const r = Math.min(radius, width / 2, Math.abs(base - end));
  const right = left + width;
  // Above the baseline the rounded end is the top; below it, the bottom.
  const sweep = pen.sweep(end < base ? 1 : 0);
  const near = end < base ? end + r : end - r;
  return `M${pen.point(left, base)}${pen.along(near)}A${r},${r} 0 0 ${sweep} ${pen.point(left + r, end)}${pen.across(right - r)}A${r},${r} 0 0 ${sweep} ${pen.point(right, near)}${pen.along(base)}Z`;
}

/** A bar's path with both ends rounded by `radius`, such as a capsule. */
function roundedBarPath(
  left: number,
  width: number,
  end: number,
  base: number,
  radius: number,
  pen: BarPen = COLUMN_PEN
): string {
  const top = Math.min(end, base);
  const bottom = Math.max(end, base);
  const r = Math.min(radius, width / 2, (bottom - top) / 2);
  const right = left + width;
  const sweep = pen.sweep(1);
  return `M${pen.point(left, top + r)}A${r},${r} 0 0 ${sweep} ${pen.point(left + r, top)}${pen.across(right - r)}A${r},${r} 0 0 ${sweep} ${pen.point(right, top + r)}${pen.along(bottom - r)}A${r},${r} 0 0 ${sweep} ${pen.point(right - r, bottom)}${pen.across(left + r)}A${r},${r} 0 0 ${sweep} ${pen.point(left, bottom - r)}Z`;
}

/** Only the rounded data end of a bar, for a cap stroke. */
function capPath(
  left: number,
  width: number,
  end: number,
  base: number,
  radius: number,
  pen: BarPen
): string {
  const r = Math.min(radius, width / 2, Math.abs(base - end));
  const right = left + width;
  const sweep = pen.sweep(end < base ? 1 : 0);
  const near = end < base ? end + r : end - r;
  return `M${pen.point(left, near)}A${r},${r} 0 0 ${sweep} ${pen.point(left + r, end)}${pen.across(right - r)}A${r},${r} 0 0 ${sweep} ${pen.point(right, near)}`;
}

function BarFill({
  fill,
  opacity,
  path
}: {
  fill: PlotFill;
  opacity?: number | undefined;
  path: string;
}) {
  const paint = useFill(fill);
  return (
    <>
      <defs>{paint.definition}</defs>
      <path d={path} fill={paint.fill} fillOpacity={paint.fillOpacity} opacity={opacity} />
    </>
  );
}

/** A place among the bars of one category, for bars grouped by series. */
export interface PlotBarGroup {
  /** The position of this series among the group, from 0 at the left, or at the top of a row. */
  index: number;
  /** The number of series in the group. */
  count: number;
  /** The gap between the bars of a group, as a share of a bar's step from 0 to 1. @defaultValue 0.1 */
  padding?: number;
}

interface PlotBarsBase<Datum> {
  data: readonly Datum[];
  /** The fill of every bar, or of each bar, such as the selected one in a stronger fill. */
  fill: PlotFill | PlotAccessor<Datum, PlotFill>;
  /** Rounds the data end of each bar by this many pixels; `"full"` makes it a half circle. */
  radius?: number | "full";
  /**
   * `"end"` rounds the data end only; `"both"` rounds the baseline end too, such as a capsule.
   * @defaultValue "end"
   */
  round?: "end" | "both";
  /** The bar width in pixels, centered in its band, or in its place in a group. By default the band width. */
  size?: number;
  /**
   * Places the bars of one series beside the other series of each category: one `PlotBars` per
   * series, each with its `index` in the group. A band sub-scale divides each category's band.
   */
  group?: PlotBarGroup;
  /**
   * A quiet bar behind each bar, across the whole value range. Stacked bars draw one track per
   * category, behind its first bar.
   */
  track?: PlotFill;
  /** A stroke along the data end, so a pale bar still shows where its value is. */
  cap?: PlotStroke | PlotAccessor<Datum, PlotStroke | undefined>;
  /**
   * Rings the bar at the active stop in the text color, with a gap of surface; stacked bars ring
   * the whole column or row as one. `false` opts out. @defaultValue the plot's `highlight`
   */
  highlight?: boolean;
}

/** Columns: each category on a band x scale, its value up the y axis. */
interface PlotColumnBars<Datum> {
  /** @defaultValue "vertical" */
  orientation?: "vertical";
  /** The category of each bar, on a band x scale. */
  x: PlotAccessor<Datum, PlotValue>;
  y: PlotAccessor<Datum, number>;
  /**
   * The value the bars grow from, or the value each bar starts at, so bars of one category stack
   * as segments, such as running totals. @defaultValue 0
   */
  y0?: number | PlotAccessor<Datum, number>;
}

/** Rows: each category on a band y scale, its value along the x axis. */
interface PlotRowBars<Datum> {
  orientation: "horizontal";
  /** The category of each bar, on a band y scale. */
  y: PlotAccessor<Datum, PlotValue>;
  x: PlotAccessor<Datum, number>;
  /** The value the bars grow from, or the value each bar starts at, so bars stack. @defaultValue 0 */
  x0?: number | PlotAccessor<Datum, number>;
}

export type PlotBarsProps<Datum> = PlotBarsBase<Datum> &
  (PlotColumnBars<Datum> | PlotRowBars<Datum>);

/** The values each bar tweens: its leading edge, width, data end, and baseline. */
const BAR_VALUES = 4;

/** One bar as drawn on this frame, in band and value pixels. */
interface ShownBar {
  left: number;
  barWidth: number;
  end: number;
  base: number;
  corner: number;
  /** False while a value has no position, such as an unknown category. */
  shown: boolean;
  flat: boolean;
  center: number;
}

/** Whether a stop on the value axis falls inside a stacked bar, which owns its data end. */
function holds(base: number, end: number, pixel: number): boolean {
  return end < base
    ? pixel >= end - 0.5 && pixel < base - 0.5
    : pixel > base + 0.5 && pixel <= end + 0.5;
}

/**
 * Bars with rounded data ends, a track, and flat or gradient fills, alone, grouped by series, or
 * stacked: vertical by default, or horizontal rows with `orientation="horizontal"`, whose rows
 * the plot picks by the pointer's height. They tween to new data by length and position; a new
 * bar grows from its baseline.
 */
export function PlotBars<Datum>(props: PlotBarsProps<Datum>) {
  const { cap, data, fill, group, highlight, radius = 0, round = "end", size, track } = props;
  const plot = useCartesian("PlotBars");
  useSeriesStops(data, props.x, props.y);
  const horizontal = props.orientation === "horizontal";
  const category: PlotAccessor<Datum, PlotValue> =
    props.orientation === "horizontal" ? props.y : props.x;
  const value: PlotAccessor<Datum, number> = props.orientation === "horizontal" ? props.x : props.y;
  const from = (props.orientation === "horizontal" ? props.x0 : props.y0) ?? 0;
  const stacked = typeof from === "function";
  const bandScale = horizontal ? plot.y : plot.x;
  const valueScale = horizontal ? plot.x : plot.y;
  const pen = horizontal ? ROW_PEN : COLUMN_PEN;
  const band = bandScale.bandwidth;
  const slot =
    group === undefined
      ? undefined
      : scaleBand<number>()
          .domain(Array.from({ length: Math.max(group.count, 1) }, (_, index) => index))
          .range([0, band])
          .paddingInner(group.padding ?? 0.1);
  const slotWidth = slot?.bandwidth() ?? band;
  const width = size ?? slotWidth;
  const offset =
    slot === undefined || group === undefined
      ? -width / 2
      : -band / 2 + (slot(group.index) ?? 0) + (slotWidth - width) / 2;
  const centers = data.map((datum, index) => bandScale.position(category(datum, index)));
  const target = data.flatMap((datum, index) => [
    (centers[index] ?? Number.NaN) + offset,
    width,
    valueScale.position(value(datum, index)),
    valueScale.position(typeof from === "function" ? from(datum, index) : from)
  ]);
  // Each bar is named by its category, and by its place in a stack, so bars that change order,
  // such as sorted ones, slide to their new places.
  const seen = new Map<string, number>();
  const keys = data.flatMap((datum, index) => {
    const name = String(category(datum, index));
    const nth = seen.get(name) ?? 0;
    seen.set(name, nth + 1);
    return Array.from({ length: BAR_VALUES }, (_, part) => `${name}\u0000${nth}\u0000${part}`);
  });
  const frame = usePlotTween(target, {
    // A new bar grows from its baseline.
    enter: (index, next) => (index % BAR_VALUES === 2 ? (target[index + 1] ?? next) : next),
    keys
  });
  const shape = round === "both" ? roundedBarPath : barPath;
  // The far edge of the value axis, where a track ends.
  const far = horizontal ? plot.inner.right : plot.inner.top;
  const { activeStop } = plot;
  const bandAxis = horizontal ? "y" : "x";
  const isActive = (center: number, base: number, end: number): boolean => {
    if (!(highlight ?? plot.highlight) || activeStop === null) return false;
    if (activeStop.axis === bandAxis) return Math.abs(center - activeStop.pixel) < 0.5;
    return stacked ? holds(base, end, activeStop.pixel) : Math.abs(end - activeStop.pixel) < 0.5;
  };
  const bars = data.map((_, index): ShownBar => {
    const at = index * BAR_VALUES;
    const left = frame.values[at] ?? Number.NaN;
    const barWidth = frame.values[at + 1] ?? width;
    const end = frame.values[at + 2] ?? Number.NaN;
    const base = frame.values[at + 3] ?? Number.NaN;
    const corner = radius === "full" ? barWidth / 2 : radius;
    const shown = Number.isFinite(left) && Number.isFinite(end) && Number.isFinite(base);
    const flat = Math.abs(end - base) < 0.01;
    const center = centers[index] ?? Number.NaN;
    return { left, barWidth, end, base, corner, shown, flat, center };
  });
  const ringed = bars.flatMap((bar, index) =>
    bar.shown && !bar.flat && isActive(bar.center, bar.base, bar.end) ? [index] : []
  );
  /** The ring around one bar, or around every ringed bar of a stack as one. */
  const ringPath = (parts: readonly ShownBar[]): string | null => {
    const [first, ...rest] = parts;
    if (first === undefined) return null;
    const up = first.end <= first.base ? 1 : -1;
    // A stack's ring spans the bars it holds, rounded at the end of its outermost bar.
    const lead = Math.min(first.left, ...rest.map((bar) => bar.left));
    const trail = Math.max(
      first.left + first.barWidth,
      ...rest.map((bar) => bar.left + bar.barWidth)
    );
    const ends = parts.flatMap((bar) => [bar.end, bar.base]);
    const end = rest.length === 0 ? first.end : up === 1 ? Math.min(...ends) : Math.max(...ends);
    const base = rest.length === 0 ? first.base : up === 1 ? Math.max(...ends) : Math.min(...ends);
    const across = rest.length === 0 ? first.barWidth : trail - lead;
    const corner = rest.length === 0 || radius !== "full" ? first.corner : across / 2;
    return shape(
      lead - RING_OFFSET,
      across + 2 * RING_OFFSET,
      end - up * RING_OFFSET,
      base + up * RING_OFFSET,
      corner + RING_OFFSET,
      pen
    );
  };
  const stackRing = stacked ? ringPath(ringed.flatMap((index) => bars[index] ?? [])) : null;

  return (
    <g>
      {data.map((datum, index) => {
        const bar = bars[index];
        if (bar === undefined || !bar.shown) return null;
        const { barWidth, base, corner, end, flat, left } = bar;
        const barFill = typeof fill === "function" ? fill(datum, index) : fill;
        const barCap = typeof cap === "function" ? cap(datum, index) : cap;
        const tracked =
          !stacked ||
          bars.findIndex((other) => Math.abs(other.center - bar.center) < 0.5) === index;
        const ring = !ringed.includes(index)
          ? null
          : stacked
            ? ringed.at(-1) === index
              ? stackRing
              : null
            : ringPath([bar]);
        return (
          <g key={index}>
            {track === undefined || !tracked ? null : (
              <BarFill fill={track} path={shape(left, barWidth, far, base, corner, pen)} />
            )}
            {flat ? null : (
              <BarFill fill={barFill} path={shape(left, barWidth, end, base, corner, pen)} />
            )}
            {barCap === undefined || flat ? null : (
              <path
                d={capPath(left, barWidth, end, base, corner, pen)}
                fill="none"
                {...strokeProps({ width: 1.5, ...barCap })}
              />
            )}
            {ring === null ? null : <path {...ringProps} d={ring} />}
          </g>
        );
      })}
    </g>
  );
}

export interface PlotHighlightProps {
  /**
   * The x value at the center of the highlight. Leave it out to follow the active point: the
   * highlight moves with it and fades out while there is none.
   */
  x?: PlotValue;
  /** The values of its two ends, or functions of the active point's index when it follows; without them it spans the drawing area, as a band. */
  y1?: number | ((index: number) => number);
  y2?: number | ((index: number) => number);
  /** The width in pixels. By default the band width of the x scale, or 16. */
  width?: number;
  /** Extends both ends by this many pixels, so the ends clear the points they hold. */
  pad?: number;
  /** The corner radius; `"full"` rounds the ends into a capsule. @defaultValue "full" */
  radius?: number | "full";
  fill: PlotFill;
  /** An outline, such as the series color around a pale fill. */
  stroke?: PlotStroke;
  /**
   * Rings a highlight with a fixed `x` while that x is the active stop, as `PlotBars` does.
   * `false` opts out. @defaultValue the plot's `highlight`
   */
  highlight?: boolean;
}

/**
 * A capsule or band that marks one x value, such as the selected day. Without `x` it follows the
 * active point. It tweens to new values.
 */
export function PlotHighlight({
  fill,
  highlight,
  pad = 0,
  radius = "full",
  stroke,
  width,
  x,
  y1,
  y2
}: PlotHighlightProps) {
  const plot = useCartesian("PlotHighlight");
  const paint = useFill(fill);
  const activeAt = useActiveAt(highlight);
  const follows = x === undefined;
  const stop = plot.activeStop?.axis === "x" ? plot.activeStop : null;
  // The last active point, so a following highlight fades out where it was.
  const last = React.useRef<{ pixel: number; index: number } | null>(null);
  if (follows && stop !== null && plot.activeIndex !== null) {
    last.current = { pixel: stop.pixel, index: plot.activeIndex };
  }
  const index = last.current?.index ?? 0;
  const end = (value: number | ((point: number) => number) | undefined, edge: number) =>
    value === undefined
      ? edge
      : plot.y.position(typeof value === "function" ? value(index) : value);
  const size = width ?? (plot.x.bandwidth > 0 ? plot.x.bandwidth : 16);
  const ends = [end(y1, plot.inner.top), end(y2, plot.inner.bottom)];
  const center = follows ? (last.current?.pixel ?? Number.NaN) : plot.x.position(x);
  const frame = usePlotTween(
    [center, Math.min(...ends) - pad, Math.max(...ends) + pad, size],
    follows ? { pace: "control" } : {}
  );
  const [shownCenter = center, top = Number.NaN, bottom = Number.NaN, shownSize = size] =
    frame.values;
  if (!Number.isFinite(shownCenter) || !Number.isFinite(top)) return null;
  const rx = (grow: number) => (radius === "full" ? shownSize / 2 + grow : radius + grow);

  return (
    <g
      className={
        follows
          ? cn(
              "transition-opacity duration-overlay ease-standard",
              plot.activeIndex === null && "opacity-0"
            )
          : undefined
      }
    >
      <defs>{paint.definition}</defs>
      <rect
        fill={paint.fill}
        fillOpacity={paint.fillOpacity}
        height={bottom - top}
        rx={rx(0)}
        width={shownSize}
        x={shownCenter - shownSize / 2}
        y={top}
        {...(stroke === undefined ? {} : strokeProps({ width: 1, ...stroke }))}
      />
      {follows || !activeAt(center, Number.NaN) ? null : (
        <rect
          {...ringProps}
          height={bottom - top + 2 * RING_OFFSET}
          rx={rx(RING_OFFSET)}
          width={shownSize + 2 * RING_OFFSET}
          x={shownCenter - shownSize / 2 - RING_OFFSET}
          y={top - RING_OFFSET}
        />
      )}
    </g>
  );
}

export type PlotCrosshairProps = PlotStroke;

/**
 * A guide line through the active point: vertical on a plot whose points run along x, such as
 * a trend, and horizontal on a plot of rows. It moves with the active point and fades out while
 * there is none. The default `"neutral"` color reaches 3:1 on every surface.
 */
export function PlotCrosshair(stroke: PlotCrosshairProps) {
  const { activeIndex, activeStop, inner } = usePlot();
  const last = React.useRef<{ axis: "x" | "y"; pixel: number } | null>(null);
  if (activeStop !== null) last.current = { axis: activeStop.axis, pixel: activeStop.pixel };
  const frame = usePlotTween([last.current?.pixel ?? Number.NaN], { pace: "control" });
  const pixel = frame.values[0] ?? Number.NaN;
  if (last.current === null || !Number.isFinite(pixel)) return null;
  const paint = strokeProps({ color: "neutral", width: 1, cap: "butt", ...stroke });

  return (
    <g
      className={cn(
        "transition-opacity duration-overlay ease-standard",
        activeIndex === null && "opacity-0"
      )}
    >
      {last.current.axis === "x" ? (
        <line {...paint} x1={pixel} x2={pixel} y1={inner.top} y2={inner.bottom} />
      ) : (
        <line {...paint} x1={inner.left} x2={inner.right} y1={pixel} y2={pixel} />
      )}
    </g>
  );
}

export interface PlotDotsProps<Datum> extends PlotSeries<Datum> {
  /** The radius in pixels. @defaultValue 3 */
  r?: number;
  /** @defaultValue "chart-1" */
  color?: PlotColor;
  /** Draws a ring around the card surface instead of a filled dot. */
  hollow?: boolean;
  /** Leaves out some points, such as the one a highlight already marks. */
  skip?: PlotAccessor<Datum, boolean>;
  /**
   * Grows the dot at the active stop and rings it with the surface. `false` opts out.
   * @defaultValue the plot's `highlight`
   */
  highlight?: boolean;
}

/** A marker at each point, filled or hollow. Markers tween to new positions. */
export function PlotDots<Datum>({
  color = "chart-1",
  data,
  highlight,
  hollow = false,
  r = 3,
  skip,
  x,
  y
}: PlotDotsProps<Datum>) {
  const plot = useCartesian("PlotDots");
  useSeriesStops(data, x, y);
  const activeAt = useActiveAt(highlight);
  const target = pixelsOf({ data, x, y }, plot.x, plot.y);
  const frame = usePlotTween(target.flat());
  const paint = hollow
    ? { fill: plotColor("surface"), stroke: plotColor(color), strokeWidth: 1.5 }
    : { fill: plotColor(color) };
  const dots = (values: readonly number[], opacity: number | undefined) =>
    pairsOf(values).map(([cx, cy], index) => {
      const datum = data[index];
      if (datum === undefined || skip?.(datum, index) === true) return null;
      const [px = Number.NaN, py = Number.NaN] = target[index] ?? [];
      const active = opacity === undefined && activeAt(px, py);
      return (
        <circle
          key={index}
          cx={cx}
          cy={cy}
          opacity={opacity}
          r={active ? r + Math.max(2, r / 2) : r}
          {...paint}
          {...(active
            ? hollow
              ? { strokeWidth: 2 }
              : { stroke: plotColor("surface"), strokeWidth: 2 }
            : {})}
        />
      );
    });

  return (
    <g>
      {frame.previous === null ? null : dots(frame.previous, 1 - frame.fade)}
      {dots(frame.values, fadeOpacity(frame))}
    </g>
  );
}

export interface PlotArcsProps {
  /** The number of equal segments, such as the steps of a gauge. */
  count?: number;
  /** Slices sized by these values, as a pie or a donut; it takes the place of `count`. */
  values?: readonly number[];
  /** In radians, clockwise from 12 o'clock. @defaultValue -π/2, the left end of a half ring */
  startAngle?: number;
  /** @defaultValue π/2, the right end of a half ring */
  endAngle?: number;
  /** The inner radius as a share of the outer one; 0 draws a pie. @defaultValue 0.6 */
  innerRatio?: number;
  /** The gap between neighbors, in radians. @defaultValue 0.02 */
  padAngle?: number;
  /** Rounds each segment's corners by this many pixels. @defaultValue 0 */
  cornerRadius?: number;
  /** The fill of each segment or slice, from the start angle on. */
  fill: (index: number) => PlotFill;
  /**
   * Grows the active slice outward when the plot picks slices: a plot whose table has one row
   * per slice. `false` opts out. @defaultValue the plot's `highlight`
   */
  highlight?: boolean;
  /**
   * An edge around each slice, or around some: the series color around a pale slice, so it
   * reads at 3:1 (COLOR-1), or the surface color for a gap of even width between slices.
   */
  stroke?: PlotStroke | ((index: number) => PlotStroke | undefined);
  /**
   * Moves a slice out from the center by this many pixels, such as the chosen slice of a pie, or
   * the active one with `(_, active) => (active ? 6 : 0)`. It tweens on the motion tokens.
   */
  offset?: (index: number, active: boolean) => number;
  /**
   * The text on each slice, such as its share, centered between the inner and outer edge with a
   * halo of surface so it reads on any fill. Empty slices and empty text show none.
   */
  label?: (index: number) => string;
}

/** The box that a ring of radius 1 around (0, 0) covers between two angles. */
function ringBounds(start: number, end: number, innerRatio: number) {
  const angles = [start, end];
  for (let quarter = Math.ceil(start / (Math.PI / 2)); quarter * (Math.PI / 2) < end; quarter++) {
    angles.push(quarter * (Math.PI / 2));
  }
  const points = [
    ...angles.map((angle) => [Math.sin(angle), -Math.cos(angle)] as const),
    ...[start, end].map(
      (angle) => [innerRatio * Math.sin(angle), -innerRatio * Math.cos(angle)] as const
    )
  ];
  const xs = points.map(([px]) => px);
  const ys = points.map(([, py]) => py);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys)
  };
}

/** The values each slice tweens: its start and end angles, solid fill opacity, and offset. */
const SLICE_VALUES = 4;

/**
 * A ring of equal segments, such as a half-circle gauge, or of value-sized slices, such as a
 * donut or a pie, drawn with `d3.arc`. It takes the largest radius that fits the drawing area
 * and centers itself there; the plot needs no scales. With one table row per slice, the plot
 * picks slices by angle and radius, and the keys step through them. Slices tween to new values.
 */
export function PlotArcs({
  cornerRadius = 0,
  count,
  endAngle = Math.PI / 2,
  fill,
  highlight,
  innerRatio = 0.6,
  label,
  offset,
  padAngle = 0.02,
  startAngle = -Math.PI / 2,
  stroke,
  values
}: PlotArcsProps) {
  const plot = usePlot();
  const { inner } = plot;
  const registry = usePlotRegistry();
  const bounds = ringBounds(startAngle, endAngle, innerRatio);
  const radius = Math.min(
    inner.width / (bounds.right - bounds.left),
    inner.height / (bounds.bottom - bounds.top)
  );
  const centerX = inner.left + (inner.width - (bounds.right + bounds.left) * radius) / 2;
  const centerY = inner.top + (inner.height - (bounds.bottom + bounds.top) * radius) / 2;
  const weights = values ?? Array.from({ length: Math.max(count ?? 0, 0) }, () => 1);
  const slices = sliceAngles(weights, startAngle, endAngle);
  const fills = slices.map((_, index) => fill(index));

  // The ring the plot hit-tests, as text so a new object with the same shape reports nothing.
  const ring: PlotRing = {
    cx: centerX,
    cy: centerY,
    inner: radius * innerRatio,
    outer: radius,
    slices
  };
  const ringKey = JSON.stringify(ring);
  const latestRing = React.useRef(ring);
  latestRing.current = ring;
  const key = React.useId();
  const { registerRing } = registry;
  React.useLayoutEffect(() => {
    registerRing(key, latestRing.current);
    return () => registerRing(key, null);
  }, [key, ringKey, registerRing]);

  const activeSlice = registry.stopAxis === "ring" ? plot.activeIndex : null;
  const frame = usePlotTween(
    slices.flatMap((slice, index) => {
      const sliceFill = fills[index];
      return [
        slice.start,
        slice.end,
        sliceFill?.type === "solid" ? (sliceFill.opacity ?? 1) : 1,
        offset?.(index, index === activeSlice) ?? 0
      ];
    }),
    // A new slice opens from the end of the ring, at the center.
    {
      enter: (index, value) =>
        index % SLICE_VALUES === 2 ? value : index % SLICE_VALUES === 3 ? 0 : endAngle
    }
  );
  const reacts = (highlight ?? plot.highlight) && activeSlice !== null;
  const grow = Math.max(3, radius * 0.06);
  const segment = arc<{ start: number; end: number; outer: number }>()
    .innerRadius(radius * innerRatio)
    .outerRadius(({ outer }) => outer)
    .cornerRadius(cornerRadius)
    .padAngle(padAngle)
    .startAngle(({ start }) => start)
    .endAngle(({ end }) => end);

  const shown = fills.map((_, index) => {
    const at = index * SLICE_VALUES;
    const start = frame.values[at] ?? 0;
    const end = frame.values[at + 1] ?? 0;
    const middle = (start + end) / 2;
    const out = frame.values[at + 3] ?? 0;
    return {
      start,
      end,
      middle,
      opacity: frame.values[at + 2] ?? 1,
      // The slice moves out along its middle angle.
      shift:
        out === 0 ? undefined : `translate(${out * Math.sin(middle)} ${-out * Math.cos(middle)})`
    };
  });
  // Labels sit halfway between the inner and the outer edge.
  const labelRadius = (radius * (innerRatio + 1)) / 2;

  return (
    <g transform={`translate(${centerX} ${centerY})`}>
      {fills.map((sliceFill, index) => {
        const slice = shown[index];
        if (slice === undefined) return null;
        const active = reacts && plot.activeIndex === index;
        const edge = typeof stroke === "function" ? stroke(index) : stroke;
        return (
          <ArcSegment
            key={index}
            fill={sliceFill.type === "solid" ? { ...sliceFill, opacity: slice.opacity } : sliceFill}
            path={
              segment({
                start: slice.start,
                end: slice.end,
                outer: active ? radius + grow : radius
              }) ?? ""
            }
            stroke={edge}
            transform={slice.shift}
          />
        );
      })}
      {label === undefined ? null : (
        <g className="fill-ds-text text-body-xs font-medium tabular-nums">
          {shown.map((slice, index) => {
            const text = slice.end - slice.start > 1e-3 ? label(index) : "";
            if (text === "") return null;
            return (
              <text
                key={index}
                dominantBaseline="central"
                paintOrder="stroke"
                stroke={plotColor("surface")}
                strokeLinejoin="round"
                strokeWidth={3}
                textAnchor="middle"
                transform={slice.shift}
                x={labelRadius * Math.sin(slice.middle)}
                y={-labelRadius * Math.cos(slice.middle)}
              >
                {text}
              </text>
            );
          })}
        </g>
      )}
    </g>
  );
}

function ArcSegment({
  fill,
  path,
  stroke,
  transform
}: {
  fill: PlotFill;
  path: string;
  stroke: PlotStroke | undefined;
  transform: string | undefined;
}) {
  const paint = useFill(fill);
  return (
    <>
      <defs>{paint.definition}</defs>
      <path
        d={path}
        fill={paint.fill}
        fillOpacity={paint.fillOpacity}
        transform={transform}
        {...(stroke === undefined ? {} : strokeProps({ width: 1, ...stroke }))}
      />
    </>
  );
}

export interface PlotAxisProps {
  axis: "x" | "y";
  /**
   * Formats each label, such as a short date. A line break (`\n`) splits a label into lines, such
   * as a long category name on two lines.
   */
  format: (value: PlotValue) => string;
  /** The values to label; by default the scale's ticks. */
  values?: readonly PlotValue[];
  /** About how many ticks to label when `values` is not set. @defaultValue 5 */
  count?: number;
  /** The distance from the drawing area to the labels, in pixels. @defaultValue 8 */
  offset?: number;
  /**
   * `"edges"` aligns the first x label to its start and the last to its end, so both stay
   * inside the plot. `"start"` aligns y labels to their start at the plot's left edge, so they
   * line up in the margin, and starts each x label at its value. @defaultValue "center"
   */
  align?: "center" | "edges" | "start";
  /**
   * Leaves out a label that sits closer than this many pixels to the one before it, so a narrow
   * plot stays readable. The first and the last label always stay.
   */
  minSpacing?: number;
  /**
   * Sets the label at the active stop in the text color and a medium weight, such as the active
   * day under a trend. @defaultValue false
   */
  highlight?: boolean;
  className?: string;
}

/** The values whose labels keep `minSpacing` pixels apart; the last one wins over its neighbor. */
function spacedOut(
  values: readonly PlotValue[],
  scale: PlotScale,
  minSpacing: number | undefined
): readonly PlotValue[] {
  if (minSpacing === undefined) return values;
  const kept: PlotValue[] = [];
  values.forEach((value, index) => {
    const previous = kept.at(-1);
    const crowded =
      previous !== undefined &&
      Math.abs(scale.position(value) - scale.position(previous)) < minSpacing;
    if (!crowded) {
      kept.push(value);
      return;
    }
    // The last label takes the place of a crowded neighbor, but never of the first label.
    if (index === values.length - 1 && kept.length > 1) {
      kept.pop();
      kept.push(value);
    }
  });
  return kept;
}

/** The step from one line of a label to the next. */
const LABEL_LINE = 1.2;
/** An emphasized label fades to and from the text color. */
const LABEL_MOTION = "transition-colors duration-control ease-standard";

/** Tick labels along one edge. They are SVG text, so they move with the scale. */
export function PlotAxis({
  align = "center",
  axis,
  className,
  count = 5,
  format,
  highlight = false,
  minSpacing,
  offset = 8,
  values
}: PlotAxisProps) {
  const { activeStop, inner, x, y } = useCartesian("PlotAxis");
  const scale = axis === "x" ? x : y;
  const at = spacedOut(values ?? scale.ticks(count), scale, minSpacing);
  const anchorOf = (index: number): "start" | "middle" | "end" => {
    if (align === "start") return "start";
    if (axis === "y") return "end";
    if (align === "edges" && index === 0) return "start";
    if (align === "edges" && index === at.length - 1) return "end";
    return "middle";
  };
  const isActive = (pixel: number): boolean =>
    highlight &&
    activeStop !== null &&
    activeStop.axis === axis &&
    Math.abs(pixel - activeStop.pixel) < 0.5;

  return (
    <g className={cn("fill-ds-text-subtle text-body-sm", className)}>
      {at.map((value, index) => {
        const pixel = scale.position(value);
        const left = axis === "x" ? pixel : align === "start" ? 0 : inner.left - offset;
        const lines = format(value).split("\n");
        return (
          <text
            key={index}
            {...(!highlight
              ? {}
              : isActive(pixel)
                ? { className: LABEL_MOTION + " font-medium", fill: plotColor("ink") }
                : { className: LABEL_MOTION })}
            dominantBaseline={axis === "x" ? "hanging" : "middle"}
            textAnchor={anchorOf(index)}
            x={left}
            y={axis === "x" ? inner.bottom + offset : pixel}
          >
            {lines.length === 1
              ? lines[0]
              : lines.map((line, row) => (
                  <tspan
                    key={row}
                    // A y label's lines center on its value; an x label's run down from it.
                    dy={`${row > 0 ? LABEL_LINE : axis === "y" ? (-(lines.length - 1) * LABEL_LINE) / 2 : 0}em`}
                    x={left}
                  >
                    {line}
                  </tspan>
                ))}
          </text>
        );
      })}
    </g>
  );
}
