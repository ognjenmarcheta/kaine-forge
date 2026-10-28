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
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  Sector,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import {
  chartCellText,
  seriesColor,
  type ChartDatum,
  type ChartSeries,
  type ChartValueFormatter
} from "./chart.series";
import { cn } from "../../lib/cn";

/** "auto" turns animation off from the first frame when prefers-reduced-motion matches. */
const ANIMATION = "auto";
const GRID_COLOR = "var(--ds-chart-grid)";
const AXIS_TICK = { fill: "var(--ds-text-subtle)" };
/** Charts sit on a card; marks use its surface for the ring and the stack gap, so both read as space. */
const MARK_SURFACE = "var(--ds-surface-raised)";
const PLOT_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
/** A rounded data end and a square baseline. */
const DATA_END_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

interface CartesianPlotProps {
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
}: Omit<CartesianPlotProps, "title"> & {
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
        swatch: seriesColor(position).swatch
      }))}
    />
  );
}

/** A solid hairline grid and quiet axes; Recharts reads them as direct chart children. */
function renderCartesianAxes(index: string, tickFormatter: ChartValueFormatter) {
  return (
    <>
      <CartesianGrid vertical={false} stroke={GRID_COLOR} />
      <XAxis
        dataKey={index}
        axisLine={false}
        tickLine={false}
        tick={AXIS_TICK}
        tickMargin={8}
        minTickGap={16}
      />
      <YAxis
        axisLine={false}
        tickLine={false}
        tick={AXIS_TICK}
        tickFormatter={tickFormatter}
        width="auto"
      />
    </>
  );
}

export function LinePlot({
  area,
  data,
  index,
  series,
  title,
  valueFormatter
}: CartesianPlotProps & { area: boolean }) {
  return (
    <ComposedChart
      data={data}
      responsive
      width="100%"
      height="100%"
      margin={PLOT_MARGIN}
      title={title}
    >
      {renderCartesianAxes(index, valueFormatter)}
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
        const { color } = seriesColor(position);
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
          isAnimationActive: ANIMATION
        } as const;

        return area ? (
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
  data,
  index,
  series,
  stacked,
  title,
  valueFormatter
}: CartesianPlotProps & { stacked: boolean | "percent" }) {
  const lastPosition = series.length - 1;

  return (
    <BarChart
      data={data}
      responsive
      width="100%"
      height="100%"
      margin={PLOT_MARGIN}
      title={title}
      barGap={2}
      maxBarSize={24}
      stackOffset={stacked === "percent" ? "expand" : "none"}
    >
      {renderCartesianAxes(index, stacked === "percent" ? formatShareTick : valueFormatter)}
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
      {series.map((item, position) => (
        <Bar
          key={item.key}
          dataKey={item.key}
          name={item.label}
          fill={seriesColor(position).color}
          isAnimationActive={ANIMATION}
          radius={stacked === false || position === lastPosition ? DATA_END_RADIUS : 0}
          {...(stacked === false ? {} : { stackId: "stack", stroke: MARK_SURFACE, strokeWidth: 2 })}
        />
      ))}
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
  series: ChartSeries;
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
  const { color } = seriesColor(0);
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
