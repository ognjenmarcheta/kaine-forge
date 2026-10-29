/**
 * Every Recharts import lives in this module. `chart.tsx` loads it with `React.lazy`, so
 * Recharts stays out of the main bundle until a chart renders.
 */
import * as React from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  DefaultZIndexes,
  LabelList,
  Line,
  Pie,
  PieChart,
  Rectangle,
  ReferenceDot,
  ReferenceLine,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  type BarShapeProps,
  type DotItemDotProps
} from "recharts";

import {
  chartCellText,
  seriesColor,
  type ChartAnnotation,
  type ChartAreaFill,
  type ChartColor,
  type ChartDatum,
  type ChartReferenceLine,
  type ChartSeries,
  type ChartValueFormatter,
  type ChartYDomain,
  type LineSeries
} from "./chart.series";
import { cn } from "../../lib/cn";

/**
 * The motion tokens in Recharts' terms: marks move to new data over `--ds-motion-overlay` and the
 * tooltip follows the pointer over `--ds-motion-control`, both on `--ds-motion-easing` (MOTION-2),
 * as the `Plot` marks and tooltip do. Recharts takes numbers, so these are the token values.
 * "auto" turns animation off from the first frame when prefers-reduced-motion matches.
 */
const MARK_MOTION = {
  isAnimationActive: "auto",
  animationDuration: 180,
  animationEasing: "cubic-bezier(0.23,1,0.32,1)"
} as const;
const TOOLTIP_MOTION = { ...MARK_MOTION, animationDuration: 120 } as const;
const GRID_COLOR = "var(--ds-chart-grid)";
const AXIS_TICK = { fill: "var(--ds-text-subtle)" };
/** Charts sit on a card; marks use its surface for the ring and the stack gap, so both read as space. */
const MARK_SURFACE = "var(--ds-surface-raised)";
const PLOT_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
/** Without a y-axis the first and last points sit on the plot edges; this leaves their x labels room. */
const EDGE_PLOT_MARGIN = { ...PLOT_MARGIN, left: 16, right: 16 };
/** Value labels sit above the bars, so the plot keeps room for one line of text over the tallest. */
const LABELLED_PLOT_MARGIN = { ...PLOT_MARGIN, top: 24 };
/** Across, value labels sit after the bars, so the plot keeps room for them after the longest. */
const LABELLED_ROW_MARGIN = { ...PLOT_MARGIN, right: 56 };
/** A rounded data end and a square baseline. */
const DATA_END_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
/** Across, the data end is the right end. */
const ROW_END_RADIUS: [number, number, number, number] = [0, 4, 4, 0];
/** Room over the plot for a pinned annotation: one line of value, or a caption and the value. */
const ANNOTATION_TOP = { value: 40, captioned: 56 };
/** From the annotated point to the bottom of its label: the 4px marker and a 6px gap. */
const ANNOTATION_GAP = 10;
/** The top of a gradient area fill; it fades to transparent at the baseline. */
const GRADIENT_TOP_OPACITY = 0.24;
/** With round caps on a 2px line, this reads as 6px dashes and 4px gaps. */
const LINE_DASH = "4 6";
/** Reference lines are dashed so they never read as a grid line. */
const REFERENCE_DASH = "4 4";
const REFERENCE_COLOR = "var(--ds-border-bold)";
/** The other bars when one category is highlighted; it reaches 3:1 like the chart slots. */
const MUTED_COLOR = seriesColor(0, "neutral").color;

/** Which axis parts a cartesian chart hides, and whether it keeps every index label. */
export interface CartesianAxes {
  hideGrid: boolean;
  hideXAxis: boolean;
  hideYAxis: boolean;
  indexLabels: "auto" | "all";
}

interface CartesianPlotProps {
  axes: CartesianAxes;
  data: ChartDatum[];
  index: string;
  series: ChartSeries[];
  title: string;
  valueFormatter: ChartValueFormatter;
}

interface TooltipRow {
  key: string;
  label: string;
  value: string;
  swatch: string;
}

/** Values lead and series names follow; a short line keys each row to its series. */
function TooltipCard({ label, rows }: { label: string | undefined; rows: TooltipRow[] }) {
  return (
    <div
      role="status"
      className="grid gap-ds-075 rounded-overlay border border-ds-border bg-ds-surface-overlay px-ds-150 py-ds-100 text-body-sm text-ds-text shadow-overlay"
    >
      {label === undefined ? null : <p className="m-0 text-ds-text-subtle">{label}</p>}
      <ul className="m-0 grid list-none gap-ds-050 p-0">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-ds-100">
            <span
              aria-hidden="true"
              className={cn("h-ds-025 w-ds-150 shrink-0 rounded-full", row.swatch)}
            />
            <span className="font-semibold tabular-nums">{row.value}</span>
            <span className="text-ds-text-subtle">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Reads the hovered datum by its position, so every series shows in series order. */
function datumAt(data: ChartDatum[], active: boolean, activeIndex: string | null | undefined) {
  return active && activeIndex != null ? data[Number(activeIndex)] : undefined;
}

function CartesianTooltip({
  active,
  activeIndex,
  data,
  index,
  series,
  valueFormatter
}: Omit<CartesianPlotProps, "axes" | "title"> & {
  active: boolean;
  activeIndex: string | null | undefined;
}) {
  const datum = datumAt(data, active, activeIndex);
  if (datum === undefined) return null;

  return (
    <TooltipCard
      label={chartCellText(datum[index], String)}
      rows={series.map((item, position) => ({
        key: item.key,
        label: item.label,
        value: chartCellText(datum[item.key], valueFormatter),
        swatch: seriesColor(position, item.color).swatch
      }))}
    />
  );
}

/**
 * A solid hairline grid and quiet axes; Recharts reads them as direct chart children. With
 * `across`, the index runs down the y-axis and the values along the x-axis.
 */
function renderCartesianAxes(
  index: string,
  tickFormatter: ChartValueFormatter,
  axes: CartesianAxes,
  { across = false, yDomain }: { across?: boolean; yDomain?: ChartYDomain | undefined } = {}
) {
  // `interval={0}` keeps every label; by default Recharts skips labels that would collide.
  const indexAxis = { dataKey: index, ...(axes.indexLabels === "all" ? { interval: 0 } : {}) };
  const valueAxis = { tickFormatter, ...(yDomain === undefined ? {} : { domain: yDomain }) };

  return (
    <>
      {axes.hideGrid ? null : (
        <CartesianGrid horizontal={!across} vertical={across} stroke={GRID_COLOR} />
      )}
      <XAxis
        hide={axes.hideXAxis}
        axisLine={false}
        tickLine={false}
        tick={AXIS_TICK}
        tickMargin={8}
        minTickGap={16}
        {...(across ? { type: "number", ...valueAxis } : indexAxis)}
      />
      <YAxis
        hide={axes.hideYAxis}
        axisLine={false}
        tickLine={false}
        tick={AXIS_TICK}
        width="auto"
        {...(across ? { type: "category", ...indexAxis } : valueAxis)}
      />
    </>
  );
}

/** A filled dot with a surface ring, as the hovered point, so it reads on a line and an area. */
const markDot = (color: string, r: number) => ({
  r,
  fill: color,
  stroke: MARK_SURFACE,
  strokeWidth: 2
});

/** The `dot` of a line: none, one per point, or one on the last point only. */
function lineDots(dots: "all" | "last" | undefined, color: string, lastPosition: number) {
  if (dots === undefined) return false;
  if (dots === "all") return markDot(color, 3);

  return function LastDot({ cx, cy, index }: DotItemDotProps) {
    return index === lastPosition && cx !== undefined && cy !== undefined ? (
      <circle key={index} cx={cx} cy={cy} {...markDot(color, 4)} />
    ) : null;
  };
}

/**
 * The marker and the always-visible label of an annotated point. The label slides from
 * centered to start- or end-aligned near the plot edges, so it never leaves the plot.
 */
function AnnotationMark({
  caption,
  color,
  cx,
  cy,
  value
}: {
  caption: string | undefined;
  color: string;
  cx: number | undefined;
  cy: number | undefined;
  value: string;
}) {
  const plot = usePlotArea();
  if (cx === undefined || cy === undefined) return null;
  // Where the point sits across the plot, from 0 at the start to 1 at the end.
  const anchor =
    plot === undefined || plot.width <= 0
      ? 0.5
      : Math.min(Math.max((cx - plot.x) / plot.width, 0), 1);

  return (
    <g aria-hidden="true">
      <circle cx={cx} cy={cy} {...markDot(color, 4)} />
      {plot === undefined ? null : (
        // A box as tall as the largest label, bottom-aligned over the point.
        <foreignObject
          className="pointer-events-none overflow-visible"
          x={plot.x}
          y={cy - ANNOTATION_GAP - ANNOTATION_TOP.captioned}
          width={plot.width}
          height={ANNOTATION_TOP.captioned}
        >
          <div className="relative h-full">
            <div
              className="absolute bottom-0 grid justify-items-center whitespace-nowrap rounded-md border border-ds-border bg-ds-surface-overlay px-ds-100 py-ds-050 shadow-overlay"
              style={{ left: cx - plot.x, transform: `translateX(${-anchor * 100}%)` }}
            >
              {caption === undefined ? null : (
                <span className="text-body-xs text-ds-text-subtle">{caption}</span>
              )}
              <span className="text-body-sm font-semibold tabular-nums text-ds-text">{value}</span>
            </div>
          </div>
        </foreignObject>
      )}
    </g>
  );
}

/** The annotated point's value and color, or nothing when the point is not in the data. */
function annotatedPoint(
  annotation: ChartAnnotation,
  data: ChartDatum[],
  index: string,
  series: LineSeries[]
) {
  const key = annotation.series ?? series[0]?.key;
  const position = series.findIndex((item) => item.key === key);
  const item = series[position];
  const value = item && data.find((datum) => datum[index] === annotation.at)?.[item.key];

  return item === undefined || typeof value !== "number"
    ? undefined
    : { color: seriesColor(position, item.color).color, value };
}

export function LinePlot({
  annotation,
  area,
  axes,
  data,
  dots,
  index,
  series,
  title,
  valueFormatter,
  yDomain
}: Omit<CartesianPlotProps, "series"> & {
  annotation: ChartAnnotation | undefined;
  area: ChartAreaFill;
  dots: "all" | "last" | undefined;
  series: LineSeries[];
  yDomain: ChartYDomain | undefined;
}) {
  // An id per chart, so two charts on a page never share a gradient; `useId` adds colons.
  const gradientPrefix = React.useId().replace(/[^a-zA-Z0-9-]/g, "");
  const gradientId = (key: string) => `${gradientPrefix}-${key}-fill`;
  const gradients = series.flatMap((item, position) =>
    (item.area ?? area) === "gradient"
      ? [{ id: gradientId(item.key), color: seriesColor(position, item.color).color }]
      : []
  );
  const pinned =
    annotation === undefined ? undefined : annotatedPoint(annotation, data, index, series);
  const margin = axes.hideYAxis ? EDGE_PLOT_MARGIN : PLOT_MARGIN;

  return (
    <ComposedChart
      data={data}
      responsive
      width="100%"
      height="100%"
      margin={
        pinned === undefined
          ? margin
          : {
              ...margin,
              top: annotation?.label === undefined ? ANNOTATION_TOP.value : ANNOTATION_TOP.captioned
            }
      }
      title={title}
    >
      {gradients.length === 0 ? null : (
        <defs>
          {gradients.map((gradient) => (
            <linearGradient key={gradient.id} id={gradient.id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={gradient.color} stopOpacity={GRADIENT_TOP_OPACITY} />
              <stop offset="1" stopColor={gradient.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
      )}
      {renderCartesianAxes(index, valueFormatter, axes, { yDomain })}
      <Tooltip
        cursor={{ stroke: "var(--ds-border-bold)", strokeWidth: 1 }}
        {...TOOLTIP_MOTION}
        content={({ active, activeIndex }) => (
          <CartesianTooltip
            active={active}
            activeIndex={activeIndex}
            data={data}
            index={index}
            series={series}
            valueFormatter={valueFormatter}
          />
        )}
      />
      {series.map((item, position) => {
        const { color } = seriesColor(position, item.color);
        const fill = item.area ?? area;
        const mark = {
          dataKey: item.key,
          name: item.label,
          type: "monotone",
          stroke: color,
          strokeWidth: 2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          dot: lineDots(dots, color, data.length - 1),
          activeDot: markDot(color, 4),
          ...MARK_MOTION,
          ...(item.dashed === true ? { strokeDasharray: LINE_DASH } : {})
        } as const;

        if (fill === false) return <Line key={item.key} {...mark} />;
        return fill === "gradient" ? (
          <Area key={item.key} {...mark} fill={`url(#${gradientId(item.key)})`} fillOpacity={1} />
        ) : (
          <Area key={item.key} {...mark} fill={color} fillOpacity={0.1} />
        );
      })}
      {pinned === undefined || annotation === undefined ? null : (
        <ReferenceDot
          x={annotation.at}
          y={pinned.value}
          zIndex={DefaultZIndexes.label}
          shape={({ cx, cy }) => (
            <AnnotationMark
              caption={annotation.label}
              color={pinned.color}
              cx={cx}
              cy={cy}
              value={valueFormatter(pinned.value)}
            />
          )}
        />
      )}
    </ComposedChart>
  );
}

const formatShareTick: ChartValueFormatter = (share) => `${Math.round(share * 100)}%`;

export function BarPlot({
  axes,
  barSize,
  data,
  highlight,
  highlightColor,
  index,
  orientation,
  referenceLine,
  series,
  stacked,
  title,
  track,
  valueFormatter,
  valueLabels
}: CartesianPlotProps & {
  barSize: number | undefined;
  highlight: string | number | undefined;
  highlightColor: ChartColor | undefined;
  orientation: "vertical" | "horizontal";
  referenceLine: ChartReferenceLine | undefined;
  stacked: boolean | "percent";
  track: boolean;
  valueLabels: "all" | "highlight" | undefined;
}) {
  const across = orientation === "horizontal";
  const endRadius = across ? ROW_END_RADIUS : DATA_END_RADIUS;
  const lastPosition = series.length - 1;
  const isHighlighted = (position: number) =>
    highlight !== undefined && data[position]?.[index] === highlight;
  // With a highlight color the other bars keep their series color; without one they turn muted.
  const highlightPaint =
    highlightColor === undefined ? undefined : seriesColor(0, highlightColor).color;
  // Labels on stacked segments collide; the tooltip and the data table carry those values.
  const labels = stacked === false ? valueLabels : undefined;
  const margin =
    labels === undefined ? PLOT_MARGIN : across ? LABELLED_ROW_MARGIN : LABELLED_PLOT_MARGIN;
  // Across, a reference label sits over the top end of its line, so the plot keeps room for it.
  const referenceLabelOnTop = across && referenceLine?.label !== undefined;

  return (
    <BarChart
      data={data}
      responsive
      width="100%"
      height="100%"
      margin={referenceLabelOnTop ? { ...margin, top: LABELLED_PLOT_MARGIN.top } : margin}
      title={title}
      barGap={2}
      maxBarSize={barSize ?? 24}
      stackOffset={stacked === "percent" ? "expand" : "none"}
      {...(barSize === undefined ? {} : { barSize })}
      {...(across ? { layout: "vertical" } : {})}
    >
      {renderCartesianAxes(index, stacked === "percent" ? formatShareTick : valueFormatter, axes, {
        across
      })}
      <Tooltip
        cursor={{ fill: "var(--ds-background-neutral-hovered)" }}
        {...TOOLTIP_MOTION}
        content={({ active, activeIndex }) => (
          <CartesianTooltip
            active={active}
            activeIndex={activeIndex}
            data={data}
            index={index}
            series={series}
            valueFormatter={valueFormatter}
          />
        )}
      />
      {referenceLine === undefined ? null : (
        <ReferenceLine
          {...(across ? { x: referenceLine.value } : { y: referenceLine.value })}
          ifOverflow="extendDomain"
          stroke={REFERENCE_COLOR}
          strokeDasharray={REFERENCE_DASH}
          {...(referenceLine.label === undefined
            ? {}
            : {
                label: {
                  value: referenceLine.label,
                  position: referenceLabelOnTop ? "top" : "insideTopRight",
                  fill: "var(--ds-text-subtle)"
                }
              })}
        />
      )}
      {series.map((item, position) => {
        const { color } = seriesColor(position, item.color);

        return (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.label}
            fill={color}
            {...MARK_MOTION}
            radius={stacked === false || position === lastPosition ? endRadius : 0}
            {...(track
              ? {
                  background: (slot: BarShapeProps) => (
                    <Rectangle {...slot} fill={GRID_COLOR} radius={endRadius} />
                  )
                }
              : {})}
            {...(highlight === undefined
              ? {}
              : {
                  shape: (bar: BarShapeProps) => (
                    <Rectangle
                      {...bar}
                      fill={
                        isHighlighted(bar.index)
                          ? (highlightPaint ?? color)
                          : highlightPaint === undefined
                            ? MUTED_COLOR
                            : color
                      }
                    />
                  )
                })}
            {...(stacked === false
              ? {}
              : { stackId: "stack", stroke: MARK_SURFACE, strokeWidth: 2 })}
          >
            {labels === undefined ? null : (
              <LabelList
                position={across ? "right" : "top"}
                offset={6}
                className={labels === "highlight" ? "font-semibold" : undefined}
                fill={labels === "highlight" ? "var(--ds-text)" : "var(--ds-text-subtle)"}
                valueAccessor={(entry, position) =>
                  typeof entry.value === "number" && (labels === "all" || isHighlighted(position))
                    ? valueFormatter(entry.value)
                    : null
                }
              />
            )}
          </Bar>
        );
      })}
    </BarChart>
  );
}

export function DonutPlot({
  data,
  index,
  series,
  valueFormatter
}: {
  data: ChartDatum[];
  index: string;
  series: Pick<ChartSeries, "key" | "label">;
  valueFormatter: ChartValueFormatter;
}) {
  return (
    <PieChart responsive width="100%" height="100%" accessibilityLayer={false}>
      <Tooltip
        {...TOOLTIP_MOTION}
        content={({ active, activeIndex }) => {
          const position = Number(activeIndex);
          const datum = datumAt(data, active, activeIndex);
          if (datum === undefined) return null;

          return (
            <TooltipCard
              label={undefined}
              rows={[
                {
                  key: String(position),
                  label: chartCellText(datum[index], String),
                  value: chartCellText(datum[series.key], valueFormatter),
                  swatch: seriesColor(position).swatch
                }
              ]}
            />
          );
        }}
      />
      <Pie
        data={data}
        dataKey={series.key}
        nameKey={index}
        innerRadius="72%"
        outerRadius="100%"
        startAngle={90}
        endAngle={-270}
        paddingAngle={2}
        stroke="none"
        rootTabIndex={-1}
        {...MARK_MOTION}
        shape={(sector) => (
          <Sector
            cx={sector.cx}
            cy={sector.cy}
            innerRadius={sector.innerRadius}
            outerRadius={sector.outerRadius}
            startAngle={sector.startAngle}
            endAngle={sector.endAngle}
            fill={seriesColor(sector.index).color}
          />
        )}
      />
    </PieChart>
  );
}

export function SparklinePlot({
  area,
  data,
  series
}: {
  area: boolean;
  data: ChartDatum[];
  series: ChartSeries;
}) {
  const { color } = seriesColor(0, series.color);
  const mark = {
    dataKey: series.key,
    type: "monotone",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    dot: false,
    ...MARK_MOTION
  } as const;

  return (
    <ComposedChart
      data={data}
      responsive
      width="100%"
      height="100%"
      accessibilityLayer={false}
      margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
    >
      <YAxis hide domain={["dataMin", "dataMax"]} />
      {area ? <Area {...mark} fill={color} fillOpacity={0.1} /> : <Line {...mark} />}
    </ComposedChart>
  );
}
