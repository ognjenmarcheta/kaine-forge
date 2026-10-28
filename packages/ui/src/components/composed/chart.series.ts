/** One row of chart data: the index value, such as a month, and one value per series. */
export type ChartDatum = Record<string, string | number>;

/**
 * A chart color: one of the theme's six categorical slots, a status role, or `"neutral"`. The
 * roles use their border tokens, which reach 3:1 on every surface like the chart slots.
 */
export type ChartColor =
  | "chart-1"
  | "chart-2"
  | "chart-3"
  | "chart-4"
  | "chart-5"
  | "chart-6"
  | "brand"
  | "success"
  | "danger"
  | "warning"
  | "information"
  | "discovery"
  | "neutral";

/** A data column that a chart draws, with its translated name. */
export interface ChartSeries {
  key: string;
  label: string;
  /**
   * Fixes the series color, so the series keeps it when other series come and go. Without it a
   * series takes the chart slot of its position. `"neutral"` mutes a series, such as a comparison.
   */
  color?: ChartColor;
}

/** A `LineChart` series, with its own line style. */
export interface LineSeries extends ChartSeries {
  /** Draws the line dashed, such as for a comparison period or a forecast. */
  dashed?: boolean;
  /** Fills the area under this line; it overrides the chart's `area`. */
  area?: boolean;
}

/** The y-axis range: a number fixes that end, and `"auto"` fits it to the data. */
export type ChartYDomain = [number | "auto", number | "auto"];

/** A horizontal line across the plot at `value`, such as a limit, with an optional label. */
export interface ChartReferenceLine {
  value: number;
  label?: string;
}

/** Formats a value for the tooltip, axis, legend, and data table. */
export type ChartValueFormatter = (value: number) => string;

/** The SVG paint (`color`) and the matching HTML utility (`swatch`) of a chart color. */
export interface ChartPaint {
  color: string;
  swatch: string;
}

const CHART_PAINTS: Record<ChartColor, ChartPaint> = {
  "chart-1": { color: "var(--ds-chart-1)", swatch: "bg-ds-chart-1" },
  "chart-2": { color: "var(--ds-chart-2)", swatch: "bg-ds-chart-2" },
  "chart-3": { color: "var(--ds-chart-3)", swatch: "bg-ds-chart-3" },
  "chart-4": { color: "var(--ds-chart-4)", swatch: "bg-ds-chart-4" },
  "chart-5": { color: "var(--ds-chart-5)", swatch: "bg-ds-chart-5" },
  "chart-6": { color: "var(--ds-chart-6)", swatch: "bg-ds-chart-6" },
  brand: { color: "var(--ds-border-brand)", swatch: "bg-ds-border-brand" },
  success: { color: "var(--ds-border-success)", swatch: "bg-ds-border-success" },
  danger: { color: "var(--ds-border-danger)", swatch: "bg-ds-border-danger" },
  warning: { color: "var(--ds-border-warning)", swatch: "bg-ds-border-warning" },
  information: { color: "var(--ds-border-information)", swatch: "bg-ds-border-information" },
  discovery: { color: "var(--ds-border-discovery)", swatch: "bg-ds-border-discovery" },
  neutral: { color: "var(--ds-border-bold)", swatch: "bg-ds-border-bold" }
};

/**
 * The categorical slots in fixed order, never cycled: a series keeps its color by position.
 * Fold series past the sixth into one "Other" series; they share the neutral.
 */
const SERIES_ORDER = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6"] as const;

/** The paint of a series: its own `color`, else the chart slot of its position. */
export function seriesColor(position: number, color?: ChartColor): ChartPaint {
  return CHART_PAINTS[color ?? SERIES_ORDER[position] ?? "neutral"];
}

export const formatChartValue: ChartValueFormatter = (value) => String(value);

/** The text of one data cell: numbers go through the formatter, text stays as it is. */
export function chartCellText(
  value: string | number | undefined,
  valueFormatter: ChartValueFormatter
): string {
  return typeof value === "number" ? valueFormatter(value) : (value ?? "");
}
