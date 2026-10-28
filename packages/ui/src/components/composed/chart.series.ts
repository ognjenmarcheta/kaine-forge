/** One row of chart data: the index value, such as a month, and one value per series. */
export type ChartDatum = Record<string, string | number>;

/** A data column that a chart draws, with its translated name. */
export interface ChartSeries {
  key: string;
  label: string;
}

/** Formats a value for the tooltip, axis, legend, and data table. */
export type ChartValueFormatter = (value: number) => string;

/**
 * The theme's categorical colors in fixed order, never cycled: a series keeps its color by
 * position. Fold series past the sixth into one "Other" series; they share a neutral.
 */
const SERIES_COLORS = [
  { color: "var(--ds-chart-1)", swatch: "bg-ds-chart-1" },
  { color: "var(--ds-chart-2)", swatch: "bg-ds-chart-2" },
  { color: "var(--ds-chart-3)", swatch: "bg-ds-chart-3" },
  { color: "var(--ds-chart-4)", swatch: "bg-ds-chart-4" },
  { color: "var(--ds-chart-5)", swatch: "bg-ds-chart-5" },
  { color: "var(--ds-chart-6)", swatch: "bg-ds-chart-6" }
] as const;
const OVERFLOW_COLOR = { color: "var(--ds-border-bold)", swatch: "bg-ds-border-bold" } as const;

/** The SVG paint (`color`) and the matching HTML utility (`swatch`) for a series position. */
export function seriesColor(position: number): { color: string; swatch: string } {
  return SERIES_COLORS[position] ?? OVERFLOW_COLOR;
}

export const formatChartValue: ChartValueFormatter = (value) => String(value);

/** The text of one data cell: numbers go through the formatter, text stays as it is. */
export function chartCellText(
  value: string | number | undefined,
  valueFormatter: ChartValueFormatter
): string {
  return typeof value === "number" ? valueFormatter(value) : (value ?? "");
}
