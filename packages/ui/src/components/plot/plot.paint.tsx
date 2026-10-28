import type { ReactNode } from "react";

import { seriesColor, type ChartColor } from "../composed/chart.series";

/**
 * The color of a mark: a chart color (`chart-1` to `chart-6`, a role, or `"neutral"`), the
 * quiet `"grid"` color, the text `"ink"`, or the card `"surface"` for the inside of a hollow
 * marker. Every one is a theme token, so a mark follows the theme and the color mode.
 */
export type PlotColor = ChartColor | "grid" | "ink" | "surface";

/** The SVG paint of a plot color. */
export function plotColor(color: PlotColor): string {
  switch (color) {
    case "grid":
      return "var(--ds-chart-grid)";
    case "ink":
      return "var(--ds-text)";
    case "surface":
      return "var(--ds-surface-raised)";
    default:
      return seriesColor(0, color).color;
  }
}

/** How a shape is filled. */
export type PlotFill =
  | {
      type: "solid";
      color: PlotColor;
      /** @defaultValue 1 */
      opacity?: number;
    }
  | {
      /** A tint that fades across each shape, such as a bar that pales toward its baseline. */
      type: "gradient";
      color: PlotColor;
      /** The opacity at the start of `direction`, from 0 to 1. */
      from: number;
      /** The opacity at its end. */
      to: number;
      /** @defaultValue "down" */
      direction?: "down" | "up" | "right" | "left";
    }
  | {
      /** Parallel lines, such as a range band. */
      type: "hatch";
      color: PlotColor;
      /** The distance between two lines, in pixels. */
      spacing: number;
      /** The tilt of the lines from vertical, in degrees; negative leans them like `\`. */
      angle: number;
      /** The line width in pixels. @defaultValue 1 */
      width?: number;
      /** The line opacity. @defaultValue 1 */
      opacity?: number;
      /** Moves the lines sideways by this many pixels, to line them up with a reference. */
      offset?: number;
    };

const GRADIENT_ENDS = {
  down: { x1: 0, y1: 0, x2: 0, y2: 1 },
  up: { x1: 0, y1: 1, x2: 0, y2: 0 },
  right: { x1: 0, y1: 0, x2: 1, y2: 0 },
  left: { x1: 1, y1: 0, x2: 0, y2: 0 }
} as const;

/** A fill's SVG definition, if it needs one, and the attributes that paint a shape with it. */
export function paintFill(
  fill: PlotFill,
  id: string
): { definition: ReactNode; fill: string; fillOpacity: number } {
  switch (fill.type) {
    case "solid":
      return { definition: null, fill: plotColor(fill.color), fillOpacity: fill.opacity ?? 1 };
    case "gradient": {
      const color = plotColor(fill.color);
      return {
        definition: (
          // Bounding-box units: each shape runs the whole fade from its own start to its end.
          <linearGradient id={id} {...GRADIENT_ENDS[fill.direction ?? "down"]}>
            <stop offset="0" stopColor={color} stopOpacity={fill.from} />
            <stop offset="1" stopColor={color} stopOpacity={fill.to} />
          </linearGradient>
        ),
        fill: `url(#${id})`,
        fillOpacity: 1
      };
    }
    case "hatch": {
      const size = fill.spacing;
      return {
        definition: (
          // User-space units: the lines continue across shapes and do not stretch with them.
          <pattern
            height={size}
            id={id}
            patternTransform={`rotate(${fill.angle}) translate(${fill.offset ?? 0} 0)`}
            patternUnits="userSpaceOnUse"
            width={size}
          >
            <line
              stroke={plotColor(fill.color)}
              strokeOpacity={fill.opacity ?? 1}
              strokeWidth={fill.width ?? 1}
              x1={size / 2}
              x2={size / 2}
              y1={0}
              y2={size}
            />
          </pattern>
        ),
        fill: `url(#${id})`,
        fillOpacity: 1
      };
    }
  }
}

/** The look of a plot tooltip: a translucent overlay surface that blurs what is behind it. */
export const PLOT_TOOLTIP_CLASS =
  "grid gap-ds-075 rounded-overlay bg-ds-surface-overlay/85 px-ds-150 py-ds-100 text-body-sm text-ds-text shadow-overlay backdrop-blur-sm";

/** A `useId` value that is safe inside `url(#…)`. */
export function svgId(reactId: string): string {
  return `plot${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
