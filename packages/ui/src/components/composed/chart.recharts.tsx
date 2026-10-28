/**
 * Every Recharts import lives in this module. `chart.tsx` loads it with `React.lazy`, so
 * Recharts stays out of the main bundle until a chart renders.
 */
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  Rectangle,
  ReferenceLine,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps
} from "recharts";

import {
  chartCellText,
  seriesColor,
  type ChartDatum,
  type ChartReferenceLine,
  type ChartSeries,
  type ChartValueFormatter,
  type ChartYDomain,
  type LineSeries
} from "./chart.series";
import { cn } from "../../lib/cn";

/** "auto" turns animation off from the first frame when prefers-reduced-motion matches. */
const ANIMATION = "auto";
const GRID_COLOR = "var(--ds-chart-grid)";
const AXIS_TICK = { fill: "var(--ds-text-subtle)" };
/** Charts sit on a card; marks use its surface for the ring and the stack gap, so both read as space. */
const MARK_SURFACE = "var(--ds-surface-raised)";
const PLOT_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
/** Without a y-axis the first and last points sit on the plot edges; this leaves their x labels room. */
const EDGE_PLOT_MARGIN = { ...PLOT_MARGIN, left: 16, right: 16 };
/** Value labels sit above the bars, so the plot keeps room for one line of text over the tallest. */
const LABELLED_PLOT_MARGIN = { ...PLOT_MARGIN, top: 24 };
/** A rounded data end and a square baseline. */
const DATA_END_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
/** With round caps on a 2px line, this reads as 6px dashes and 4px gaps. */
const LINE_DASH = "4 6";
/** Reference lines are dashed so they never read as a grid line. */
const REFERENCE_DASH = "4 4";
const REFERENCE_COLOR = "var(--ds-border-bold)";
/** The other bars when one category is highlighted; it reaches 3:1 like the chart slots. */
const MUTED_COLOR = seriesColor(0, "neutral").color;

/** Which axis parts a cartesian chart hides. */
export interface CartesianAxes {
  hideGrid: boolean;
  hideXAxis: boolean;
  hideYAxis: boolean;
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

/** A solid hairline grid and quiet axes; Recharts reads them as direct chart children. */
function renderCartesianAxes(
  index: string,
  tickFormatter: ChartValueFormatter,
  axes: CartesianAxes,
  yDomain?: ChartYDomain
) {
  return (
    <>
      {axes.hideGrid ? null : <CartesianGrid vertical={false} stroke={GRID_COLOR} />}
      <XAxis
        dataKey={index}
        hide={axes.hideXAxis}
        axisLine={false}
        tickLine={false}
        tick={AXIS_TICK}
        tickMargin={8}
        minTickGap={16}
      />
      <YAxis
        hide={axes.hideYAxis}
        axisLine={false}
        tickLine={false}
        tick={AXIS_TICK}
        tickFormatter={tickFormatter}
        width="auto"
        {...(yDomain === undefined ? {} : { domain: yDomain })}
      />
    </>
  );
}

export function LinePlot({
  area,
  axes,
  data,
  index,
  series,
  title,
  valueFormatter,
  yDomain
}: Omit<CartesianPlotProps, "series"> & {
  area: boolean;
  series: LineSeries[];
  yDomain: ChartYDomain | undefined;
}) {
  return (
    <ComposedChart
      data={data}
      responsive
      width="100%"
      height="100%"
      margin={axes.hideYAxis ? EDGE_PLOT_MARGIN : PLOT_MARGIN}
      title={title}
    >
      {renderCartesianAxes(index, valueFormatter, axes, yDomain)}
      <Tooltip
        cursor={{ stroke: "var(--ds-border-bold)", strokeWidth: 1 }}
        isAnimationActive={ANIMATION}
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
        const mark = {
          dataKey: item.key,
          name: item.label,
          type: "monotone",
          stroke: color,
          strokeWidth: 2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          dot: false,
          activeDot: { r: 4, fill: color, stroke: MARK_SURFACE, strokeWidth: 2 },
          isAnimationActive: ANIMATION,
          ...(item.dashed === true ? { strokeDasharray: LINE_DASH } : {})
        } as const;

        return (item.area ?? area) ? (
          <Area key={item.key} {...mark} fill={color} fillOpacity={0.1} />
        ) : (
          <Line key={item.key} {...mark} />
        );
      })}
    </ComposedChart>
  );
}

const formatShareTick: ChartValueFormatter = (share) => `${Math.round(share * 100)}%`;

export function BarPlot({
  axes,
  barSize,
  data,
  highlight,
  index,
  referenceLine,
  series,
  stacked,
  title,
  valueFormatter,
  valueLabels
}: CartesianPlotProps & {
  barSize: number | undefined;
  highlight: string | number | undefined;
  referenceLine: ChartReferenceLine | undefined;
  stacked: boolean | "percent";
  valueLabels: "all" | "highlight" | undefined;
}) {
  const lastPosition = series.length - 1;
  const isHighlighted = (position: number) =>
    highlight !== undefined && data[position]?.[index] === highlight;
  // Labels on stacked segments collide; the tooltip and the data table carry those values.
  const labels = stacked === false ? valueLabels : undefined;

  return (
    <BarChart
      data={data}
      responsive
      width="100%"
      height="100%"
      margin={labels === undefined ? PLOT_MARGIN : LABELLED_PLOT_MARGIN}
      title={title}
      barGap={2}
      maxBarSize={barSize ?? 24}
      stackOffset={stacked === "percent" ? "expand" : "none"}
      {...(barSize === undefined ? {} : { barSize })}
    >
      {renderCartesianAxes(index, stacked === "percent" ? formatShareTick : valueFormatter, axes)}
      <Tooltip
        cursor={{ fill: "var(--ds-background-neutral-hovered)" }}
        isAnimationActive={ANIMATION}
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
          y={referenceLine.value}
          ifOverflow="extendDomain"
          stroke={REFERENCE_COLOR}
          strokeDasharray={REFERENCE_DASH}
          {...(referenceLine.label === undefined
            ? {}
            : {
                label: {
                  value: referenceLine.label,
                  position: "insideTopRight",
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
            isAnimationActive={ANIMATION}
            radius={stacked === false || position === lastPosition ? DATA_END_RADIUS : 0}
            {...(highlight === undefined
              ? {}
              : {
                  shape: (bar: BarShapeProps) => (
                    <Rectangle {...bar} fill={isHighlighted(bar.index) ? color : MUTED_COLOR} />
                  )
                })}
            {...(stacked === false
              ? {}
              : { stackId: "stack", stroke: MARK_SURFACE, strokeWidth: 2 })}
          >
            {labels === undefined ? null : (
              <LabelList
                position="top"
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
        isAnimationActive={ANIMATION}
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
        isAnimationActive={ANIMATION}
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

export function RadialPlot({ max, value }: { max: number; value: number }) {
  return (
    <RadialBarChart
      data={[{ value: Math.min(Math.max(value, 0), max) }]}
      responsive
      width="100%"
      height="100%"
      accessibilityLayer={false}
      innerRadius="80%"
      outerRadius="100%"
      startAngle={90}
      endAngle={-270}
    >
      <PolarAngleAxis type="number" domain={[0, max]} tick={false} axisLine={false} />
      <RadialBar
        dataKey="value"
        fill="var(--ds-chart-1)"
        background={{ fill: GRID_COLOR }}
        cornerRadius="50%"
        isAnimationActive={ANIMATION}
      />
    </RadialBarChart>
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
    isAnimationActive: ANIMATION
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
