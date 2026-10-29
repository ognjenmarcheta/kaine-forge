import * as React from "react";

import {
  chartCellText,
  formatChartValue,
  seriesColor,
  type ChartAnnotation,
  type ChartAreaFill,
  type ChartColor,
  type ChartDatum,
  type ChartPaint,
  type ChartReferenceLine,
  type ChartSeries,
  type ChartValueFormatter,
  type ChartYDomain,
  type LineSeries
} from "./chart.series";
import { ChartTable } from "./chart.table";
import { cn } from "../../lib/cn";
import {
  PlotContext,
  PlotRegistryContext,
  type PlotContextValue,
  type PlotRegistry
} from "../plot/plot.context";
import {
  activeOf,
  keyPick,
  nextPick,
  type PlotPick,
  type PlotPickEvent
} from "../plot/plot.interaction";
import { usePrefersReducedMotion, useTween } from "../plot/plot.motion";
import { PlotTooltip } from "../plot/plot.overlay";
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
  /**
   * `"all"` shows every index label, such as all twelve months. By default a narrow plot skips
   * labels that would collide; pass `"all"` only when the labels fit at the narrowest width.
   * @defaultValue "auto"
   */
  indexLabels?: "auto" | "all";
}

interface LineChartProps extends CartesianChartProps {
  /** The series to draw, in color order; each can be dashed or filled. Pass at most six. */
  series: LineSeries[];
  /**
   * Fills the area under each line: `true` with a flat tint, `"gradient"` with a tint that fades
   * to transparent toward the baseline. A series' own `area` overrides it.
   */
  area?: ChartAreaFill;
  /** Draws a dot on `"all"` points, or on the `"last"` point only, such as today's value. */
  dots?: "all" | "last";
  /**
   * Pins one point's value over the plot with a marker, such as a peak. The value and its
   * caption stay visible without hover; the data table gives the caption after the value.
   */
  annotation?: ChartAnnotation;
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
   * Paints the `highlight` bar in this color and keeps the other bars in their series color,
   * instead of muting them. Use it with one series.
   */
  highlightColor?: ChartColor;
  /**
   * Prints values on the bars: on `"all"` of them, or on the `"highlight"` category only. Keep
   * `"all"` for few, wide bars; labels on narrow grouped bars collide.
   */
  valueLabels?: "all" | "highlight";
  /** A dashed horizontal line across the plot, such as a limit, with an optional label. */
  referenceLine?: ChartReferenceLine;
  /** The bar thickness in pixels. By default bars fill their band up to 24px. */
  barSize?: number;
  /**
   * `"horizontal"` draws the bars across, one row per category, for long category names. The
   * categories then run down the y-axis and the values along the x-axis, so `hideXAxis` hides
   * the values. @defaultValue "vertical"
   */
  orientation?: "vertical" | "horizontal";
  /** Draws a quiet track behind each bar, across the whole value range. */
  track?: boolean;
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
   * A fixed square ring that fits inline: 40, 48, 64, or 96px, such as `xs` in a stat tile, or
   * a number for a ring that fills a box of that many pixels, such as 28 in a table row. The
   * center shows `label` from 96px only; the data table keeps it at every size. Without it the
   * ring fills its container at `height`.
   */
  size?: "xs" | "sm" | "md" | "lg" | number;
  /** The ring color. @defaultValue "chart-1" */
  color?: ChartColor;
  /** A pale disc of this color inside the ring, such as the ring's own color. */
  fill?: ChartColor;
  /** The inner radius as a share of the outer one; lower is a thicker ring. @defaultValue 0.84 */
  innerRatio?: number;
  /**
   * Where the value shows: in the ring, or after it, for a small ring beside its figure in a
   * row. @defaultValue "inside"
   */
  valuePosition?: "inside" | "end";
  /**
   * The ring answers the pointer and the keyboard as the charts do (DATA-5): hover, focus, or a
   * tap grows the arc and shows the title and value beside the ring, and a click or Enter pins
   * it until Escape. Without it the ring is a still picture, whose value is already in sight.
   */
  interaction?: boolean;
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

function seriesTable(
  data: ChartDatum[],
  index: string,
  series: ChartSeries[],
  valueFormatter: ChartValueFormatter,
  annotation?: ChartAnnotation
) {
  const annotatedKey = annotation?.series ?? series[0]?.key;
  const cellText = (datum: ChartDatum, key: string) => {
    const text = chartCellText(datum[key], valueFormatter);
    // The annotation caption follows its value, so the table names the pinned point too.
    return annotation?.label !== undefined && key === annotatedKey && datum[index] === annotation.at
      ? `${text} (${annotation.label})`
      : text;
  };

  return (
    <ChartTable
      columns={series.map((item) => item.label)}
      rows={data.map((datum) => ({
        header: chartCellText(datum[index], String),
        cells: series.map((item) => cellText(datum, item.key))
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
        // A plot of fixed width keeps it beside the legend; a fluid one takes the room left.
        legendPosition === "right" && (width === undefined ? "min-w-ds-0 flex-1" : "shrink-0")
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
  annotation,
  area = false,
  className,
  data,
  dots,
  height = 240,
  hideGrid = false,
  hideTitle = false,
  hideXAxis = false,
  hideYAxis = false,
  index,
  indexLabels = "auto",
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
      table={seriesTable(data, index, series, valueFormatter, annotation)}
    >
      <LinePlot
        annotation={annotation}
        area={area}
        axes={{ hideGrid, hideXAxis, hideYAxis, indexLabels }}
        data={data}
        dots={dots}
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
  highlightColor,
  index,
  indexLabels = "auto",
  orientation = "vertical",
  referenceLine,
  series,
  stacked = false,
  title,
  track = false,
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
        axes={{ hideGrid, hideXAxis, hideYAxis, indexLabels }}
        barSize={barSize}
        data={data}
        highlight={highlight}
        highlightColor={highlightColor}
        index={index}
        orientation={orientation}
        referenceLine={referenceLine}
        series={series}
        stacked={stacked}
        title={title}
        track={track}
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
  xs: { box: 40, value: "text-body-xs font-semibold", label: undefined },
  sm: { box: 48, value: "text-heading-xxs", label: undefined },
  md: { box: 64, value: "text-heading-xs", label: undefined },
  lg: { box: 96, value: "text-heading-sm", label: "text-body-xs" }
} as const;

/** The center text of a ring `box` pixels wide: that of the largest named size that fits. */
function radialText(box: number) {
  if (box >= RADIAL_SIZES.lg.box) return RADIAL_SIZES.lg;
  if (box >= RADIAL_SIZES.md.box) return RADIAL_SIZES.md;
  if (box >= RADIAL_SIZES.sm.box) return RADIAL_SIZES.sm;
  return RADIAL_SIZES.xs;
}

/**
 * The ring on a 100-unit square, as the chart library drew it: a band from 82% to 98% of the
 * radius. A named or fluid ring keeps that library's 5px margin, so it draws as it always has;
 * a ring of a pixel `size` fills its box.
 */
const RING = { center: 50, outer: 49, inner: 41 } as const;
const RING_MARGIN = 5;
const RING_TRACK = "var(--ds-chart-grid)";
/** How much wider the arc draws while active, as a share of the band. */
const RING_GROWTH = 0.5;
/** How far past the ring the pointer still finds it, in pixels. */
const RING_REACH = 6;

/** The width of an element, read at once and kept current. */
function useBoxWidth(): [number, React.RefCallback<HTMLDivElement>] {
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

/**
 * One value out of `max` as a ring that fills clockwise from 12 o'clock; the value shows in the
 * ring, or after it with `valuePosition="end"`, a percentage by default. Plain SVG: a new value
 * sweeps the arc with the motion tokens and snaps under reduced motion.
 */
function RadialProgress({
  className,
  color,
  fill,
  height = 160,
  hideTitle = false,
  innerRatio,
  interaction = false,
  label,
  max = 100,
  size,
  title,
  value,
  valueFormatter,
  valuePosition = "inside"
}: RadialProgressProps) {
  const text = valueFormatter ? valueFormatter(value) : formatShare(value, max);
  const box =
    typeof size === "number" ? size : size === undefined ? undefined : RADIAL_SIZES[size].box;
  const type = box === undefined ? undefined : radialText(box);
  const margin = typeof size === "number" ? 0 : RING_MARGIN;
  const inner =
    innerRatio === undefined ? RING.inner : RING.outer * Math.min(Math.max(innerRatio, 0), 1);
  const band = RING.outer - inner;
  const middle = (RING.outer + inner) / 2;

  const element = React.useRef<SVGSVGElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const target = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const share = useTween([target], { animate: !reducedMotion, element }).values[0] ?? target;
  const circumference = 2 * Math.PI * middle;
  // The round ends sit inside the arc's angle, as before: each end takes this angle.
  const capAngle = Math.asin(Math.min(band / 2 / middle, 1));
  const arcLength = Math.max(share * 2 * Math.PI - 2 * capAngle, 0) * middle;

  // With `interaction`, the ring is one point that the pointer and the keyboard pick.
  const [pick, setPick] = React.useState<PlotPick>({ transient: null, selected: null });
  const active = interaction ? activeOf(pick) : null;
  const dispatch = (...events: PlotPickEvent[]) =>
    setPick((current) =>
      events.reduce((state, event) => nextPick(state, event, { count: 1, mode: "pin" }), current)
    );
  const [measured, measure] = useBoxWidth();
  const sliderElement = React.useRef<HTMLDivElement | null>(null);
  const sliderRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      sliderElement.current = node;
      return measure(node);
    },
    [measure]
  );
  const plotHeight = box ?? height;
  const plotWidth = box ?? measured;
  const scale = Math.max(Math.min(plotWidth, plotHeight) - 2 * margin, 0) / 100;
  const ring = { x: plotWidth / 2, y: plotHeight / 2, outer: RING.outer * scale };
  const onRing = (event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - bounds.left - ring.x;
    const dy = event.clientY - bounds.top - ring.y;
    return Math.hypot(dx, dy) <= ring.outer + RING_REACH;
  };
  const onPointer = (event: React.PointerEvent<HTMLDivElement>) =>
    dispatch(onRing(event) ? { type: "point", index: 0 } : { type: "leave" });
  // The tooltip reads the ring as a plot of one point, beside the ring's top right.
  const plot: PlotContextValue = {
    width: plotWidth,
    height: plotHeight,
    inner: {
      left: 0,
      top: 0,
      right: plotWidth,
      bottom: plotHeight,
      width: plotWidth,
      height: plotHeight
    },
    x: undefined,
    y: undefined,
    id: "",
    activeIndex: active,
    selectedIndex: pick.selected,
    activeStop: null,
    highlight: true,
    animate: !reducedMotion
  };
  const registry: PlotRegistry = {
    element: sliderElement,
    stopAxis: "ring",
    wantsStops: null,
    registerStops: () => undefined,
    registerRing: () => undefined,
    anchorOf: () => ({ x: ring.x + ring.outer + 8, y: ring.y - ring.outer })
  };

  const centerText =
    type === undefined ? (
      <CenterText hidden label={label} value={text} />
    ) : (
      <CenterText
        hidden
        label={type.label === undefined ? undefined : label}
        value={text}
        valueClassName={type.value}
        {...(type.label === undefined ? {} : { labelClassName: type.label })}
      />
    );
  const slider = interaction ? (
    <div
      ref={sliderRef}
      aria-label={title}
      aria-valuemax={1}
      aria-valuemin={1}
      aria-valuenow={1}
      aria-valuetext={`${title}: ${text}`}
      // The plot box draws the focus ring around the ring.
      className="absolute inset-0 touch-pan-y focus-visible:outline-none"
      role="slider"
      tabIndex={0}
      onBlur={() => dispatch({ type: "leave" })}
      onClick={(event) => {
        if (onRing(event)) dispatch({ type: "point", index: 0 }, { type: "commit" });
      }}
      onFocus={() => dispatch({ type: "focus" })}
      onKeyDown={(event) => {
        const pickEvent = keyPick(event.key, "ring");
        // Escape with nothing to hide stays with the page, such as a dialog that closes on it.
        if (pickEvent === null || (pickEvent.type === "dismiss" && active === null)) return;
        event.preventDefault();
        dispatch(pickEvent);
      }}
      onPointerDown={onPointer}
      onPointerLeave={() => dispatch({ type: "leave" })}
      onPointerMove={onPointer}
    >
      {plotWidth > 0 ? (
        <PlotContext.Provider value={plot}>
          <PlotRegistryContext.Provider value={registry}>
            <PlotTooltip side="right">
              {() => (
                <>
                  <p className="m-0 text-ds-text-subtle">{title}</p>
                  <p className="m-0 font-medium tabular-nums">{text}</p>
                </>
              )}
            </PlotTooltip>
          </PlotRegistryContext.Provider>
        </PlotContext.Provider>
      ) : null}
    </div>
  ) : null;

  return (
    <ChartFrame
      className={className}
      height={plotHeight}
      hideTitle={hideTitle}
      plotHidden
      title={title}
      {...(box === undefined ? {} : { width: box })}
      {...(valuePosition === "end"
        ? {
            legendPosition: "right" as const,
            legend: (
              // The data table gives the same value to assistive technology.
              <p
                aria-hidden="true"
                className="m-0 flex items-baseline gap-ds-050 tabular-nums"
                data-slot="radial-progress-value"
              >
                <span className="text-body font-medium text-ds-text">{text}</span>
                {label === undefined ? null : (
                  <span className="text-body-sm text-ds-text-subtle">{label}</span>
                )}
              </p>
            )
          }
        : {})}
      overlay={
        <>
          {valuePosition === "inside" ? centerText : null}
          {slider}
        </>
      }
      table={
        <ChartTable
          columns={[]}
          rows={[{ header: title, cells: label === undefined ? [text] : [text, label] }]}
        />
      }
    >
      <svg
        ref={element}
        className="block h-full w-full overflow-visible"
        style={{ padding: margin }}
        viewBox="0 0 100 100"
      >
        {fill === undefined ? null : (
          <circle
            cx={RING.center}
            cy={RING.center}
            fill={seriesColor(0, fill).color}
            fillOpacity={0.1}
            r={Math.max(inner - band / 2, 0)}
          />
        )}
        <circle
          cx={RING.center}
          cy={RING.center}
          fill="none"
          r={middle}
          stroke={RING_TRACK}
          strokeWidth={band}
        />
        {share > 0 ? (
          <circle
            className="transition-[stroke-width] duration-control ease-standard"
            cx={RING.center}
            cy={RING.center}
            fill="none"
            r={middle}
            stroke={seriesColor(0, color).color}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={-capAngle * middle}
            strokeLinecap="round"
            strokeWidth={band * (active === null ? 1 : 1 + RING_GROWTH)}
            transform={`rotate(-90 ${RING.center} ${RING.center})`}
          />
        ) : null}
      </svg>
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
  ChartAnnotation,
  ChartAreaFill,
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
