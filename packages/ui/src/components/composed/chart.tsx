import * as React from "react";

import {
  chartCellText,
  formatChartValue,
  seriesColor,
  type ChartDatum,
  type ChartSeries,
  type ChartValueFormatter
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
}

interface LineChartProps extends CartesianChartProps {
  /** Fills the area under each line. */
  area?: boolean;
}

interface BarChartProps extends CartesianChartProps {
  /** Stacks the series in one bar; `"percent"` scales each bar to 100%. */
  stacked?: boolean | "percent";
}

interface DonutChartProps extends ChartBaseProps {
  data: ChartDatum[];
  /** The key of the slice name in each datum. Pass at most six slices. */
  index: string;
  /** The value column that the slices divide. */
  series: ChartSeries;
  /** A headline in the hole, such as the formatted total. */
  centerValue?: string;
  centerLabel?: string;
}

interface RadialProgressProps extends ChartBaseProps {
  value: number;
  /** @defaultValue 100 */
  max?: number;
  /** Supporting text under the value in the center. */
  label?: string;
}

interface SparklineProps extends ChartBaseProps {
  data: ChartDatum[];
  index: string;
  series: ChartSeries;
  area?: boolean;
}

interface LegendItem {
  key: string;
  label: string;
  value?: string;
}

/** Visual identity only: the data table gives assistive technology the same names. */
function ChartLegend({ items, mark }: { items: LegendItem[]; mark: "line" | "square" }) {
  return (
    <ul
      aria-hidden="true"
      className="m-0 flex list-none flex-wrap gap-x-ds-200 gap-y-ds-050 p-0 text-body-sm text-ds-text-subtle"
    >
      {items.map((item, position) => (
        <li key={item.key} className="flex items-center gap-ds-075">
          <span
            className={cn(
              "shrink-0",
              mark === "line" ? "h-ds-025 w-ds-150 rounded-full" : "size-ds-100 rounded-sm",
              seriesColor(position).swatch
            )}
          />
          <span>{item.label}</span>
          {item.value === undefined ? null : (
            <span className="font-medium tabular-nums text-ds-text">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

interface ChartTableRow {
  header: string;
  cells: string[];
}

/** The chart's data for screen readers, with the series names as column headers. */
function ChartTable({ columns, rows }: { columns: string[]; rows: ChartTableRow[] }) {
  return (
    <table className="sr-only">
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
  /** Text centered over the plot. */
  overlay?: React.ReactNode;
}

function ChartFrame({
  children,
  className,
  height,
  hideTitle,
  legend,
  overlay,
  plotHidden,
  table,
  title
}: ChartFrameProps) {
  const titleId = React.useId();

  return (
    <figure aria-labelledby={titleId} className={cn("m-0 grid gap-ds-150", className)}>
      <figcaption id={titleId} className={hideTitle ? "sr-only" : "text-heading-xs text-ds-text"}>
        {title}
      </figcaption>
      {legend}
      <div
        className="relative rounded-md text-body-sm has-focus-visible:ring-2 has-focus-visible:ring-ds-border-focused [&_svg]:outline-none"
        style={{ height }}
      >
        <div aria-hidden={plotHidden || undefined} className="h-full">
          <React.Suspense fallback={<Skeleton className="h-full w-full" />}>
            {children}
          </React.Suspense>
        </div>
        {overlay}
      </div>
      {table}
    </figure>
  );
}

interface CenterTextProps {
  /** Hides text that the data table already gives assistive technology. */
  hidden: boolean;
  label: string | undefined;
  value: string | undefined;
}

function CenterText({ hidden, label, value }: CenterTextProps) {
  return (
    <div
      aria-hidden={hidden || undefined}
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
    >
      {value === undefined ? null : <span className="text-heading-md text-ds-text">{value}</span>}
      {label === undefined ? null : (
        <span className="text-body-sm text-ds-text-subtle">{label}</span>
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
  hideTitle = false,
  index,
  series,
  title,
  valueFormatter = formatChartValue
}: LineChartProps) {
  return (
    <ChartFrame
      className={className}
      height={height}
      hideTitle={hideTitle}
      plotHidden={false}
      title={title}
      legend={
        series.length > 1 ? <ChartLegend items={series} mark={area ? "square" : "line"} /> : null
      }
      table={seriesTable(data, index, series, valueFormatter)}
    >
      <LinePlot
        area={area}
        data={data}
        index={index}
        series={series}
        title={title}
        valueFormatter={valueFormatter}
      />
    </ChartFrame>
  );
}

/** Grouped bars, `stacked` bars, or `stacked="percent"` bars that each fill 100%. */
function BarChart({
  className,
  data,
  height = 240,
  hideTitle = false,
  index,
  series,
  stacked = false,
  title,
  valueFormatter = formatChartValue
}: BarChartProps) {
  return (
    <ChartFrame
      className={className}
      height={height}
      hideTitle={hideTitle}
      plotHidden={false}
      title={title}
      legend={series.length > 1 ? <ChartLegend items={series} mark="square" /> : null}
      table={seriesTable(data, index, series, valueFormatter)}
    >
      <BarPlot
        data={data}
        index={index}
        series={series}
        stacked={stacked}
        title={title}
        valueFormatter={valueFormatter}
      />
    </ChartFrame>
  );
}

/** Parts of one whole; the legend lists each slice with its value. */
function DonutChart({
  centerLabel,
  centerValue,
  className,
  data,
  height = 200,
  hideTitle = false,
  index,
  series,
  title,
  valueFormatter = formatChartValue
}: DonutChartProps) {
  const slices = data.map((datum, position) => ({
    key: String(position),
    label: chartCellText(datum[index], String),
    value: chartCellText(datum[series.key], valueFormatter)
  }));

  return (
    <ChartFrame
      className={className}
      height={height}
      hideTitle={hideTitle}
      plotHidden
      title={title}
      legend={<ChartLegend items={slices} mark="square" />}
      overlay={<CenterText hidden={false} label={centerLabel} value={centerValue} />}
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

/** One value out of `max` as a ring; the center shows the value, a percentage by default. */
function RadialProgress({
  className,
  height = 160,
  hideTitle = false,
  label,
  max = 100,
  title,
  value,
  valueFormatter
}: RadialProgressProps) {
  const text = valueFormatter ? valueFormatter(value) : formatShare(value, max);

  return (
    <ChartFrame
      className={className}
      height={height}
      hideTitle={hideTitle}
      plotHidden
      title={title}
      overlay={<CenterText hidden label={label} value={text} />}
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

export { BarChart, DonutChart, LineChart, RadialProgress, Sparkline };
export type {
  BarChartProps,
  ChartDatum,
  ChartSeries,
  ChartValueFormatter,
  DonutChartProps,
  LineChartProps,
  RadialProgressProps,
  SparklineProps
};
