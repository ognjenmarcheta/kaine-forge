import * as React from "react";

import {
  chartCellText,
  formatChartValue,
  seriesColor,
  type ChartColor,
  type ChartDatum,
  type ChartPaint,
  type ChartReferenceLine,
  type ChartSeries,
  type ChartValueFormatter,
  type ChartYDomain,
  type LineSeries
} from "./chart.series";
import { cn } from "../../lib/cn";
import { Skeleton } from "../primitives/skeleton";

// Recharts loads on first render, outside the main bundle; each plot shares the one module.
const LinePlot = React.lazy(() =>
  import("./chart.recharts").then((module) => ({ default: module.LinePlot }))
);
const BarPlot = React.lazy(() =>
  import("./chart.recharts").then((module) => ({ default: module.BarPlot }))
);
const DonutPlot = React.lazy(() =>
  import("./chart.recharts").then((module) => ({ default: module.DonutPlot }))
);
const RadialPlot = React.lazy(() =>
  import("./chart.recharts").then((module) => ({ default: module.RadialPlot }))
);
const SparklinePlot = React.lazy(() =>
  import("./chart.recharts").then((module) => ({ default: module.SparklinePlot }))
);

interface ChartBaseProps {
  /** Names the chart; assistive technology announces it as the figure name. */
  title: string;
  /** Keeps the title for screen readers only, for a chart under its own visible heading. */
  hideTitle?: boolean;
  className?: string;
  /** The plot height in pixels; the loading skeleton keeps the same height. */
  height?: number;
  /** Formats values in the tooltip, the axis, the legend, and the data table. */
  valueFormatter?: ChartValueFormatter;
}

interface CartesianChartProps extends ChartBaseProps {
  data: ChartDatum[];
  /** The key of the x-axis value in each datum, such as `"month"`. */
  index: string;
  /** The series to draw, in color order. Pass at most six. */
  series: ChartSeries[];
  /** Hides the horizontal grid lines. */
  hideGrid?: boolean;
  /** Hides the x-axis labels. */
  hideXAxis?: boolean;
  /** Hides the y-axis labels; the tooltip and the data table still give every value. */
  hideYAxis?: boolean;
}

interface LineChartProps extends CartesianChartProps {
  /** The series to draw, in color order; each can be dashed or filled. Pass at most six. */
  series: LineSeries[];
  /** Fills the area under each line; a series' own `area` overrides it. */
  area?: boolean;
  /** The y-axis range, such as `["auto", "auto"]` to fit the data. By default it starts at 0. */
  yDomain?: ChartYDomain;
}

interface BarChartProps extends CartesianChartProps {
  /** Stacks the series in one bar; `"percent"` scales each bar to 100%. */
  stacked?: boolean | "percent";
  /**
   * The index value of one category to emphasize, such as `"Apr"`; the other bars turn
   * neutral. Say in text why it stands out, such as in a value label or the description.
   */
  highlight?: string | number;
  /**
   * Prints values on the bars: on `"all"` of them, or on the `"highlight"` category only. Keep
   * `"all"` for few, wide bars; labels on narrow grouped bars collide.
   */
  valueLabels?: "all" | "highlight";
  /** A dashed horizontal line across the plot, such as a limit, with an optional label. */
  referenceLine?: ChartReferenceLine;
  /** The bar thickness in pixels. By default bars fill their band up to 24px. */
  barSize?: number;
}

interface DonutChartProps extends ChartBaseProps {
  data: ChartDatum[];
  /** The key of the slice name in each datum. Pass at most six slices. */
  index: string;
  /** The value column that the slices divide. Slices take the chart slots in order. */
  series: Pick<ChartSeries, "key" | "label">;
  /** A headline in the hole, such as the formatted total. */
  centerValue?: string;
  centerLabel?: string;
  /** The type step of the center value. @defaultValue "md" */
  centerValueSize?: "md" | "lg" | "xl";
  /**
   * Where the legend sits. With `"none"`, show the slice names and values as text elsewhere.
   * @defaultValue "top"
   */
  legend?: "top" | "right" | "bottom" | "none";
}

interface RadialProgressProps extends ChartBaseProps {
  value: number;
  /** @defaultValue 100 */
  max?: number;
  /** Supporting text under the value in the center. */
  label?: string;
  /**
   * A fixed square ring that fits inline: 48, 64, or 96px. The center shows `label` at `lg`
   * only; the data table keeps it at every size. Without it the ring fills its container at
   * `height`.
   */
  size?: "sm" | "md" | "lg";
}

interface SparklineProps extends ChartBaseProps {
  data: ChartDatum[];
  index: string;
  /** The column to draw; its `color` sets the line color. */
  series: ChartSeries;
  area?: boolean;
}

type LegendMark = "line" | "dashed" | "square";

interface LegendItem {
  key: string;
  label: string;
  mark: LegendMark;
  paint: ChartPaint;
  value?: string;
}

function LegendKey({ mark, paint }: { mark: LegendMark; paint: ChartPaint }) {
  if (mark === "dashed") {
    // With round caps, the 2px dashes read like the plot's dashed line at legend size.
    return (
      <svg className="h-ds-025 w-ds-150 shrink-0 overflow-visible" viewBox="0 0 12 2">
        <line
          x1="1"
          y1="1"
          x2="11"
          y2="1"
          stroke={paint.color}
          strokeDasharray="2 4"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  return (
    <span
      className={cn(
        "shrink-0",
        mark === "line" ? "h-ds-025 w-ds-150 rounded-full" : "size-ds-100 rounded-sm",
        paint.swatch
      )}
    />
  );
}

/** Visual identity only: the data table gives assistive technology the same names. */
function ChartLegend({
  direction = "row",
  items
}: {
  direction?: "row" | "column";
  items: LegendItem[];
}) {
  return (
    <ul
      aria-hidden="true"
      className={cn(
        "m-0 list-none p-0 text-body-sm text-ds-text-subtle",
        direction === "row" ? "flex flex-wrap gap-x-ds-200 gap-y-ds-050" : "grid gap-ds-100"
      )}
    >
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-ds-075">
          <LegendKey mark={item.mark} paint={item.paint} />
          <span>{item.label}</span>
          {item.value === undefined ? null : (
            <span className="font-medium tabular-nums text-ds-text">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One legend item per series, keyed by its color and its mark. */
function seriesLegendItems<Series extends ChartSeries>(
  series: Series[],
  markOf: (item: Series) => LegendMark
): LegendItem[] {
  return series.map((item, position) => ({
    key: item.key,
    label: item.label,
    mark: markOf(item),
    paint: seriesColor(position, item.color)
  }));
}

interface ChartTableRow {
  header: string;
  cells: string[];
}

/** The chart's data for screen readers, with the series names as column headers. */
function ChartTable({ columns, rows }: { columns: string[]; rows: ChartTableRow[] }) {
  return (
    // A table ignores the 1px box of `sr-only` and keeps its full size, which lengthens or
    // widens the page; the block wrapper clips it to 1px, and screen readers still read it.
    <div className="sr-only">
      <table>
        {columns.length === 0 ? null : (
          <thead>
            <tr>
              <td />
              {columns.map((column, position) => (
                <th key={position} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, position) => (
            <tr key={position}>
              <th scope="row">{row.header}</th>
              {row.cells.map((cell, cellPosition) => (
                <td key={cellPosition}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function seriesTable(
  data: ChartDatum[],
  index: string,
  series: ChartSeries[],
  valueFormatter: ChartValueFormatter
) {
  return (
    <ChartTable
      columns={series.map((item) => item.label)}
      rows={data.map((datum) => ({
        header: chartCellText(datum[index], String),
        cells: series.map((item) => chartCellText(datum[item.key], valueFormatter))
      }))}
    />
  );
}

interface ChartFrameProps {
  children: React.ReactNode;
  className: string | undefined;
  height: number;
  hideTitle: boolean;
  /** Hides a plot that offers no keyboard interaction; the data table carries its data. */
  plotHidden: boolean;
  title: string;
  table: React.ReactNode;
  legend?: React.ReactNode;
  /** Where the legend sits; `"right"` sets it beside the plot. */
  legendPosition?: "top" | "right" | "bottom";
  /** Text centered over the plot. */
  overlay?: React.ReactNode;
  /** A fixed plot width in pixels, for a chart that sits inline; it fills its container otherwise. */
  width?: number;
}

function ChartFrame({
  children,
  className,
  height,
  hideTitle,
  legend,
  legendPosition = "top",
  overlay,
  plotHidden,
  table,
  title,
  width
}: ChartFrameProps) {
  const titleId = React.useId();
  const plot = (
    <div
      className={cn(
        "relative rounded-md text-body-sm has-focus-visible:ring-2 has-focus-visible:ring-ds-border-focused [&_svg]:outline-none",
        legendPosition === "right" && "min-w-ds-0 flex-1"
      )}
      style={width === undefined ? { height } : { height, width }}
    >
      <div aria-hidden={plotHidden || undefined} className="h-full">
        <React.Suspense fallback={<Skeleton className="h-full w-full" />}>
          {children}
        </React.Suspense>
      </div>
      {overlay}
    </div>
  );

  return (
    <figure
      aria-labelledby={titleId}
      className={cn("m-0 grid gap-ds-150", width !== undefined && "w-fit", className)}
    >
      <figcaption id={titleId} className={hideTitle ? "sr-only" : "text-heading-xs text-ds-text"}>
        {title}
      </figcaption>
      {legendPosition === "top" ? legend : null}
      {legendPosition === "right" ? (
        <div className="flex items-center gap-ds-200">
          {plot}
          {legend}
        </div>
      ) : (
        plot
      )}
      {legendPosition === "bottom" ? legend : null}
      {table}
    </figure>
  );
}

interface CenterTextProps {
  /** Hides text that the data table already gives assistive technology. */
  hidden: boolean;
  label: string | undefined;
  labelClassName?: string;
  value: string | undefined;
  valueClassName?: string;
}

function CenterText({
  hidden,
  label,
  labelClassName = "text-body-sm",
  value,
  valueClassName = "text-heading-md"
}: CenterTextProps) {
  return (
    <div
      aria-hidden={hidden || undefined}
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
    >
      {value === undefined ? null : (
        <span className={cn("text-ds-text", valueClassName)}>{value}</span>
      )}
      {label === undefined ? null : (
        <span className={cn("text-ds-text-subtle", labelClassName)}>{label}</span>
      )}
    </div>
  );
}

/** Lines over time, or filled areas with `area`. Keyboard users move the tooltip with arrow keys. */
function LineChart({
  area = false,
  className,
  data,
  height = 240,
  hideGrid = false,
  hideTitle = false,
  hideXAxis = false,
  hideYAxis = false,
  index,
  series,
  title,
  valueFormatter = formatChartValue,
  yDomain
}: LineChartProps) {
  return (
    <ChartFrame
      className={className}
      height={height}
      hideTitle={hideTitle}
      plotHidden={false}
      title={title}
      legend={
        series.length > 1 ? (
          <ChartLegend
            items={seriesLegendItems(series, (item) =>
              (item.area ?? area) ? "square" : item.dashed === true ? "dashed" : "line"
            )}
          />
        ) : null
      }
      table={seriesTable(data, index, series, valueFormatter)}
    >
      <LinePlot
        area={area}
        axes={{ hideGrid, hideXAxis, hideYAxis }}
        data={data}
        index={index}
        series={series}
        title={title}
        valueFormatter={valueFormatter}
        yDomain={yDomain}
      />
    </ChartFrame>
  );
}

/** Grouped bars, `stacked` bars, or `stacked="percent"` bars that each fill 100%. */
function BarChart({
  barSize,
  className,
  data,
  height = 240,
  hideGrid = false,
  hideTitle = false,
  hideXAxis = false,
  hideYAxis = false,
  highlight,
  index,
  referenceLine,
  series,
  stacked = false,
  title,
  valueFormatter = formatChartValue,
  valueLabels
}: BarChartProps) {
  return (
    <ChartFrame
      className={className}
      height={height}
      hideTitle={hideTitle}
      plotHidden={false}
      title={title}
      legend={
        series.length > 1 ? <ChartLegend items={seriesLegendItems(series, () => "square")} /> : null
      }
      table={seriesTable(data, index, series, valueFormatter)}
    >
      <BarPlot
        axes={{ hideGrid, hideXAxis, hideYAxis }}
        barSize={barSize}
        data={data}
        highlight={highlight}
        index={index}
        referenceLine={referenceLine}
        series={series}
        stacked={stacked}
        title={title}
        valueFormatter={valueFormatter}
        valueLabels={valueLabels}
      />
    </ChartFrame>
  );
}

const CENTER_VALUE_SIZES = {
  md: "text-heading-md",
  lg: "text-heading-lg",
  xl: "text-heading-xl"
} as const;

/** Parts of one whole; the legend lists each slice with its value. */
function DonutChart({
  centerLabel,
  centerValue,
  centerValueSize = "md",
  className,
  data,
  height = 200,
  hideTitle = false,
  index,
  legend = "top",
  series,
  title,
  valueFormatter = formatChartValue
}: DonutChartProps) {
  const slices = data.map((datum, position): LegendItem & { value: string } => ({
    key: String(position),
    label: chartCellText(datum[index], String),
    mark: "square",
    paint: seriesColor(position),
    value: chartCellText(datum[series.key], valueFormatter)
  }));

  return (
    <ChartFrame
      className={className}
      height={height}
      hideTitle={hideTitle}
      plotHidden
      title={title}
      {...(legend === "none"
        ? {}
        : {
            legend: (
              <ChartLegend direction={legend === "right" ? "column" : "row"} items={slices} />
            ),
            legendPosition: legend
          })}
      overlay={
        <CenterText
          hidden={false}
          label={centerLabel}
          value={centerValue}
          valueClassName={CENTER_VALUE_SIZES[centerValueSize]}
        />
      }
      table={
        <ChartTable
          columns={[series.label]}
          rows={slices.map((slice) => ({ header: slice.label, cells: [slice.value] }))}
        />
      }
    >
      <DonutPlot data={data} index={index} series={series} valueFormatter={valueFormatter} />
    </ChartFrame>
  );
}

const formatShare = (value: number, max: number) => `${Math.round((value / max) * 100)}%`;

/** Inline ring sizes; below 96px the hole has no room for the label. */
const RADIAL_SIZES = {
  sm: { box: 48, value: "text-heading-xxs", label: undefined },
  md: { box: 64, value: "text-heading-xs", label: undefined },
  lg: { box: 96, value: "text-heading-sm", label: "text-body-xs" }
} as const;

/** One value out of `max` as a ring; the center shows the value, a percentage by default. */
function RadialProgress({
  className,
  height = 160,
  hideTitle = false,
  label,
  max = 100,
  size,
  title,
  value,
  valueFormatter
}: RadialProgressProps) {
  const text = valueFormatter ? valueFormatter(value) : formatShare(value, max);
  const inline = size === undefined ? undefined : RADIAL_SIZES[size];

  return (
    <ChartFrame
      className={className}
      height={inline?.box ?? height}
      hideTitle={hideTitle}
      plotHidden
      title={title}
      {...(inline === undefined ? {} : { width: inline.box })}
      overlay={
        inline === undefined ? (
          <CenterText hidden label={label} value={text} />
        ) : (
          <CenterText
            hidden
            label={inline.label === undefined ? undefined : label}
            value={text}
            valueClassName={inline.value}
            {...(inline.label === undefined ? {} : { labelClassName: inline.label })}
          />
        )
      }
      table={
        <ChartTable
          columns={[]}
          rows={[{ header: title, cells: label === undefined ? [text] : [text, label] }]}
        />
      }
    >
      <RadialPlot max={max} value={value} />
    </ChartFrame>
  );
}

/** A small trend line with no axes, legend, or tooltip, such as inside a stat card. */
function Sparkline({
  area = false,
  className,
  data,
  height = 40,
  hideTitle = false,
  index,
  series,
  title,
  valueFormatter = formatChartValue
}: SparklineProps) {
  return (
    <ChartFrame
      className={className}
      height={height}
      hideTitle={hideTitle}
      plotHidden
      title={title}
      table={seriesTable(data, index, [series], valueFormatter)}
    >
      <SparklinePlot area={area} data={data} series={series} />
    </ChartFrame>
  );
}

export { BarChart, DonutChart, LineChart, RadialProgress, Sparkline, seriesColor };
export type {
  BarChartProps,
  ChartColor,
  ChartDatum,
  ChartPaint,
  ChartReferenceLine,
  ChartSeries,
  ChartValueFormatter,
  ChartYDomain,
  DonutChartProps,
  LineChartProps,
  LineSeries,
  RadialProgressProps,
  SparklineProps
};
