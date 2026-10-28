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

import { usePlot, type PlotContextValue } from "./plot";
import { paintFill, plotColor, type PlotColor, type PlotFill } from "./plot.paint";
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

/** A curve through pixel points, broken where a point has no position. */
function pathThroughPixels(points: readonly [number, number][], curve: PlotCurve): string {
  return (
    line()
      .defined(([px, py]) => Number.isFinite(px) && Number.isFinite(py))
      .curve(CURVES[curve])(points) ?? ""
  );
}

function pathThrough<Datum>(
  series: PlotSeries<Datum>,
  x: PlotScale,
  y: PlotScale,
  curve: PlotCurve
): string {
  return pathThroughPixels(pixelsOf(series, x, y), curve);
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
}

/** A line through a series, solid, dashed, or dotted. */
export function PlotLine<Datum>({ curve = "linear", data, x, y, ...stroke }: PlotLineProps<Datum>) {
  const plot = useCartesian("PlotLine");
  return (
    <path
      d={pathThrough({ data, x, y }, plot.x, plot.y, curve)}
      fill="none"
      {...strokeProps(stroke)}
    />
  );
}

export interface PlotAreaProps<Datum> extends PlotSeries<Datum> {
  fill: PlotFill;
  /** The value of the baseline; by default the bottom of the drawing area. */
  y0?: number;
  /** @defaultValue "linear" */
  curve?: PlotCurve;
}

/** The area between a series and a baseline: flat, a gradient, or hatched. */
export function PlotArea<Datum>({ curve = "linear", data, fill, x, y, y0 }: PlotAreaProps<Datum>) {
  const plot = useCartesian("PlotArea");
  const paint = useFill(fill);
  const top = pathThrough({ data, x, y }, plot.x, plot.y, curve);
  const baseline = y0 === undefined ? plot.inner.bottom : plot.y.position(y0);
  const first = data[0];
  const last = data.at(-1);
  if (top === "" || first === undefined || last === undefined) return null;
  const start = plot.x.position(x(first, 0));
  const end = plot.x.position(x(last, data.length - 1));

  return (
    <g>
      <defs>{paint.definition}</defs>
      <path
        d={`${top}L${end},${baseline}L${start},${baseline}Z`}
        fill={paint.fill}
        fillOpacity={paint.fillOpacity}
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

/** The area between two series, such as a price range or a forecast's spread. */
export function PlotBand<Upper, Lower>({
  curve = "linear",
  fill,
  lower,
  upper
}: PlotBandProps<Upper, Lower>) {
  const plot = useCartesian("PlotBand");
  const paint = useFill(fill);
  const top = pathThrough(upper, plot.x, plot.y, curve);
  // The bottom edge runs back from right to left, which closes the shape; the curves are
  // symmetric, so the edge is the same line a forward pass would draw.
  // Each datum keeps its own index for the accessors; only the finished points run backward.
  const bottom = pathThroughPixels(pixelsOf(lower, plot.x, plot.y).reverse(), curve);
  if (top === "" || bottom === "") return null;

  return (
    <g>
      <defs>{paint.definition}</defs>
      <path d={`${top}L${bottom.slice(1)}Z`} fill={paint.fill} fillOpacity={paint.fillOpacity} />
    </g>
  );
}

/** A bar's path with its data end rounded by `radius`, from `base` to `end` in pixels. */
function barPath(left: number, width: number, end: number, base: number, radius: number): string {
  const r = Math.min(radius, width / 2, Math.abs(base - end));
  const right = left + width;
  // Above the baseline the rounded end is the top; below it, the bottom.
  const sweep = end < base ? 1 : 0;
  const near = end < base ? end + r : end - r;
  return `M${left},${base}V${near}A${r},${r} 0 0 ${sweep} ${left + r},${end}H${right - r}A${r},${r} 0 0 ${sweep} ${right},${near}V${base}Z`;
}

/** Only the rounded data end of a bar, for a cap stroke. */
function capPath(left: number, width: number, end: number, base: number, radius: number): string {
  const r = Math.min(radius, width / 2, Math.abs(base - end));
  const right = left + width;
  const sweep = end < base ? 1 : 0;
  const near = end < base ? end + r : end - r;
  return `M${left},${near}A${r},${r} 0 0 ${sweep} ${left + r},${end}H${right - r}A${r},${r} 0 0 ${sweep} ${right},${near}`;
}

function BarFill({ fill, path }: { fill: PlotFill; path: string }) {
  const paint = useFill(fill);
  return (
    <>
      <defs>{paint.definition}</defs>
      <path d={path} fill={paint.fill} fillOpacity={paint.fillOpacity} />
    </>
  );
}

export interface PlotBarsProps<Datum> {
  data: readonly Datum[];
  /** The category of each bar, on a band x scale. */
  x: PlotAccessor<Datum, PlotValue>;
  y: PlotAccessor<Datum, number>;
  /** The fill of every bar, or of each bar, such as the selected one in a stronger fill. */
  fill: PlotFill | PlotAccessor<Datum, PlotFill>;
  /** The value the bars grow from. @defaultValue 0 */
  y0?: number;
  /** Rounds the data end of each bar by this many pixels; `"full"` makes it a half circle. */
  radius?: number | "full";
  /** The bar width in pixels, centered in its band. By default the band width. */
  size?: number;
  /** A quiet bar behind each bar, across the whole value range. */
  track?: PlotFill;
  /** A stroke along the data end, so a pale bar still shows where its value is. */
  cap?: PlotStroke | PlotAccessor<Datum, PlotStroke | undefined>;
}

/** Vertical bars with rounded data ends, a track, and flat or gradient fills. */
export function PlotBars<Datum>({
  cap,
  data,
  fill,
  radius = 0,
  size,
  track,
  x,
  y,
  y0 = 0
}: PlotBarsProps<Datum>) {
  const plot = useCartesian("PlotBars");
  const base = plot.y.position(y0);
  const width = size ?? plot.x.bandwidth;
  const round = radius === "full" ? width / 2 : radius;

  return (
    <g>
      {data.map((datum, index) => {
        const left = plot.x.position(x(datum, index)) - width / 2;
        const end = plot.y.position(y(datum, index));
        const barFill = typeof fill === "function" ? fill(datum, index) : fill;
        const barCap = typeof cap === "function" ? cap(datum, index) : cap;
        if (!Number.isFinite(left) || !Number.isFinite(end)) return null;
        return (
          <g key={index}>
            {track === undefined ? null : (
              <BarFill fill={track} path={barPath(left, width, plot.inner.top, base, round)} />
            )}
            {end === base ? null : (
              <BarFill fill={barFill} path={barPath(left, width, end, base, round)} />
            )}
            {barCap === undefined || end === base ? null : (
              <path
                d={capPath(left, width, end, base, round)}
                fill="none"
                {...strokeProps({ width: 1.5, ...barCap })}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

export interface PlotHighlightProps {
  /** The x value at the center of the highlight. */
  x: PlotValue;
  /** The values of its two ends; without them it spans the drawing area, as a band. */
  y1?: number;
  y2?: number;
  /** The width in pixels. By default the band width of the x scale, or 16. */
  width?: number;
  /** Extends both ends by this many pixels, so the ends clear the points they hold. */
  pad?: number;
  /** The corner radius; `"full"` rounds the ends into a capsule. @defaultValue "full" */
  radius?: number | "full";
  fill: PlotFill;
  /** An outline, such as the series color around a pale fill. */
  stroke?: PlotStroke;
}

/** A capsule or band that marks one x value, such as the selected day. */
export function PlotHighlight({
  fill,
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
  const size = width ?? (plot.x.bandwidth > 0 ? plot.x.bandwidth : 16);
  const ends = [
    y1 === undefined ? plot.inner.top : plot.y.position(y1),
    y2 === undefined ? plot.inner.bottom : plot.y.position(y2)
  ];
  const top = Math.min(...ends) - pad;
  const height = Math.max(...ends) + pad - top;
  const center = plot.x.position(x);
  if (!Number.isFinite(center) || !Number.isFinite(top)) return null;

  return (
    <g>
      <defs>{paint.definition}</defs>
      <rect
        fill={paint.fill}
        fillOpacity={paint.fillOpacity}
        height={height}
        rx={radius === "full" ? size / 2 : radius}
        width={size}
        x={center - size / 2}
        y={top}
        {...(stroke === undefined ? {} : strokeProps({ width: 1, ...stroke }))}
      />
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
}

/** A marker at each point, filled or hollow. */
export function PlotDots<Datum>({
  color = "chart-1",
  data,
  hollow = false,
  r = 3,
  skip,
  x,
  y
}: PlotDotsProps<Datum>) {
  const plot = useCartesian("PlotDots");
  const paint = hollow
    ? { fill: plotColor("surface"), stroke: plotColor(color), strokeWidth: 1.5 }
    : { fill: plotColor(color) };

  return (
    <g>
      {data.map((datum, index) =>
        skip?.(datum, index) === true ? null : (
          <circle
            key={index}
            cx={plot.x.position(x(datum, index))}
            cy={plot.y.position(y(datum, index))}
            r={r}
            {...paint}
          />
        )
      )}
    </g>
  );
}

export interface PlotArcsProps {
  /** The number of segments. */
  count: number;
  /** In radians, clockwise from 12 o'clock. @defaultValue -π/2, the left end of a half ring */
  startAngle?: number;
  /** @defaultValue π/2, the right end of a half ring */
  endAngle?: number;
  /** The inner radius as a share of the outer one. @defaultValue 0.6 */
  innerRatio?: number;
  /** The gap between neighbors, in radians. @defaultValue 0.02 */
  padAngle?: number;
  /** Rounds each segment's corners by this many pixels. @defaultValue 0 */
  cornerRadius?: number;
  /** The fill of each segment, from the start angle on. */
  fill: (index: number) => PlotFill;
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

/**
 * A segmented ring, such as a half-circle gauge, drawn with `d3.arc`. It takes the largest
 * radius that fits the drawing area and centers itself there; the plot needs no scales.
 */
export function PlotArcs({
  cornerRadius = 0,
  count,
  endAngle = Math.PI / 2,
  fill,
  innerRatio = 0.6,
  padAngle = 0.02,
  startAngle = -Math.PI / 2
}: PlotArcsProps) {
  const { inner } = usePlot();
  const bounds = ringBounds(startAngle, endAngle, innerRatio);
  const radius = Math.min(
    inner.width / (bounds.right - bounds.left),
    inner.height / (bounds.bottom - bounds.top)
  );
  const centerX = inner.left + (inner.width - (bounds.right + bounds.left) * radius) / 2;
  const centerY = inner.top + (inner.height - (bounds.bottom + bounds.top) * radius) / 2;
  const step = (endAngle - startAngle) / Math.max(count, 1);
  const segment = arc<{ index: number }>()
    .innerRadius(radius * innerRatio)
    .outerRadius(radius)
    .cornerRadius(cornerRadius)
    .padAngle(padAngle)
    .startAngle(({ index }) => startAngle + index * step)
    .endAngle(({ index }) => startAngle + (index + 1) * step);

  return (
    <g transform={`translate(${centerX} ${centerY})`}>
      {Array.from({ length: count }, (_, index) => (
        <ArcSegment key={index} fill={fill(index)} path={segment({ index }) ?? ""} />
      ))}
    </g>
  );
}

function ArcSegment({ fill, path }: { fill: PlotFill; path: string }) {
  const paint = useFill(fill);
  return (
    <>
      <defs>{paint.definition}</defs>
      <path d={path} fill={paint.fill} fillOpacity={paint.fillOpacity} />
    </>
  );
}

export interface PlotAxisProps {
  axis: "x" | "y";
  /** Formats each label, such as a short date. */
  format: (value: PlotValue) => string;
  /** The values to label; by default the scale's ticks. */
  values?: readonly PlotValue[];
  /** About how many ticks to label when `values` is not set. @defaultValue 5 */
  count?: number;
  /** The distance from the drawing area to the labels, in pixels. @defaultValue 8 */
  offset?: number;
  /**
   * `"edges"` aligns the first x label to its start and the last to its end, so both stay
   * inside the plot. @defaultValue "center"
   */
  align?: "center" | "edges";
  /**
   * Leaves out a label that sits closer than this many pixels to the one before it, so a narrow
   * plot stays readable. The first and the last label always stay.
   */
  minSpacing?: number;
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

/** Tick labels along one edge. They are SVG text, so they move with the scale. */
export function PlotAxis({
  align = "center",
  axis,
  className,
  count = 5,
  format,
  minSpacing,
  offset = 8,
  values
}: PlotAxisProps) {
  const { inner, x, y } = useCartesian("PlotAxis");
  const scale = axis === "x" ? x : y;
  const at = spacedOut(values ?? scale.ticks(count), scale, minSpacing);
  const anchorOf = (index: number): "start" | "middle" | "end" => {
    if (axis === "y") return "end";
    if (align === "edges" && index === 0) return "start";
    if (align === "edges" && index === at.length - 1) return "end";
    return "middle";
  };

  return (
    <g className={cn("fill-ds-text-subtle text-body-sm", className)}>
      {at.map((value, index) => (
        <text
          key={index}
          dominantBaseline={axis === "x" ? "hanging" : "middle"}
          textAnchor={anchorOf(index)}
          x={axis === "x" ? scale.position(value) : inner.left - offset}
          y={axis === "x" ? inner.bottom + offset : scale.position(value)}
        >
          {format(value)}
        </text>
      ))}
    </g>
  );
}
