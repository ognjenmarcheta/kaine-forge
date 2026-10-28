import * as React from "react";

import {
  formatChartValue,
  seriesColor,
  type ChartColor,
  type ChartValueFormatter
} from "./chart.series";
import { cn } from "../../lib/cn";

/** One part of a banded gauge, such as the projects that are more than half done. */
interface GaugePart {
  key: string;
  /** The translated name of the part, for the legend and the data table. */
  label: string;
  value: number;
  /** Fixes the part color; without it a part takes the chart slot of its position. */
  color?: ChartColor;
}

interface GaugeBaseProps {
  /** Names the gauge; assistive technology announces it as the figure name. */
  title: string;
  /** Keeps the title for screen readers only, for a gauge under its own visible heading. */
  hideTitle?: boolean;
  className?: string;
  /** The gauge height in pixels; the half ring is about twice as wide. @defaultValue 128 */
  height?: number;
  /** The full scale. @defaultValue 100 with `value`, the total of the parts with `parts` */
  max?: number;
  /** `"segmented"` draws rounded segments; `"solid"` draws one arc. @defaultValue "segmented" */
  appearance?: "segmented" | "solid";
  /** The number of segments in a segmented gauge. @defaultValue 24 */
  segments?: number;
  /**
   * The headline in the center, such as `"55%"`. With `value` it defaults to the share of
   * `max`, or to `valueFormatter(value)`; with `parts` it has no default.
   */
  centerValue?: string;
  /** Supporting text under the center value, such as "Project completion". */
  centerLabel?: string;
  /** Formats `value`, or the value of each part in the legend and the data table. */
  valueFormatter?: ChartValueFormatter;
}

/** One value out of `max`, in one color. */
interface GaugeValueProps {
  value: number;
  /** @defaultValue "chart-1" */
  color?: ChartColor;
  parts?: never;
}

/** Several parts side by side, each in its own color, with a legend. */
interface GaugePartsProps {
  /** The parts in order from the left end. Pass at most six. */
  parts: GaugePart[];
  value?: never;
  color?: never;
}

type GaugeProps = GaugeBaseProps & (GaugeValueProps | GaugePartsProps);

/** The view box: a half ring around the center, with room for the round segment ends. */
const VIEW_BOX = "-4 -4 208 106";
const CENTER = { x: 100, y: 100 };
const RADIUS = { inner: 74, outer: 96 };
const MID_RADIUS = (RADIUS.inner + RADIUS.outer) / 2;
/** The quiet track of the empty part, as the `RadialProgress` ring. */
const TRACK_COLOR = "var(--ds-chart-grid)";
/** A segment takes this share of its arc, and never more than 10 units, so few stay slim. */
const SEGMENT_FILL = 0.6;
const SEGMENT_MAX_WIDTH = 10;
/** The gap between the arcs of a solid gauge, as a share of the half ring: 2°, as the donut. */
const SOLID_GAP = 1 / 90;

/** The point at `share` of the half ring, from the left end, on a circle of `radius`. */
function ringPoint(share: number, radius: number) {
  const angle = Math.PI * (1 - share);
  return { x: CENTER.x + radius * Math.cos(angle), y: CENTER.y - radius * Math.sin(angle) };
}

/** Where each part ends, as a share of the half ring; past `max`, the parts stop at the end. */
function partEnds(values: number[], max: number) {
  let total = 0;
  return values.map((value) => {
    total += Math.max(value, 0);
    return max > 0 ? Math.min(total / max, 1) : 0;
  });
}

/** For each segment from the left, the position of the part that fills it, or -1 for the track. */
function segmentOwners(ends: number[], count: number) {
  const lastSegments = ends.map((end) => Math.round(end * count));
  return Array.from({ length: count }, (_, segment) =>
    lastSegments.findIndex((last) => segment < last)
  );
}

/** The arcs of a solid gauge: one per part, then the track, with a gap between neighbors. */
function solidArcs(ends: number[]) {
  const pieces = [...ends, 1].map((end, position) => ({
    owner: position < ends.length ? position : -1,
    from: position === 0 ? 0 : (ends[position - 1] ?? 0),
    to: end
  }));

  return pieces.flatMap((piece) => {
    const from = piece.from === 0 ? 0 : piece.from + SOLID_GAP / 2;
    const to = piece.to === 1 ? 1 : piece.to - SOLID_GAP / 2;
    if (to <= from) return [];
    const start = ringPoint(from, MID_RADIUS);
    const end = ringPoint(to, MID_RADIUS);
    return [
      {
        owner: piece.owner,
        path: `M ${start.x} ${start.y} A ${MID_RADIUS} ${MID_RADIUS} 0 0 1 ${end.x} ${end.y}`
      }
    ];
  });
}

const formatShare = (value: number, max: number) =>
  `${Math.round((max > 0 ? value / max : 0) * 100)}%`;

/**
 * A half ring that fills from the left: one value out of `max`, or several `parts` with a
 * legend. Plain SVG, so it renders without the chart library. The center shows a headline, and
 * a visually hidden table gives the data to assistive technology (A11Y-7).
 */
function Gauge(props: GaugeProps) {
  const {
    appearance = "segmented",
    centerLabel,
    className,
    height = 128,
    hideTitle = false,
    segments = 24,
    title,
    valueFormatter
  } = props;
  const titleId = React.useId();
  const single = props.parts === undefined;
  // A single value is one part named by the title, so both kinds share the drawing.
  const parts: GaugePart[] =
    props.parts === undefined
      ? [
          {
            key: "value",
            label: title,
            value: props.value,
            ...(props.color === undefined ? {} : { color: props.color })
          }
        ]
      : props.parts;
  const values = parts.map((part) => part.value);
  const max = props.max ?? (single ? 100 : values.reduce((sum, value) => sum + value, 0));
  const ends = partEnds(values, max);
  const paintOf = (owner: number) => {
    const part = parts[owner];
    return part === undefined ? TRACK_COLOR : seriesColor(owner, part.color).color;
  };
  const format = valueFormatter ?? formatChartValue;
  const centerValue =
    props.centerValue ??
    (props.parts === undefined
      ? valueFormatter
        ? valueFormatter(props.value)
        : formatShare(props.value, max)
      : undefined);
  const count = Math.max(Math.round(segments), 1);
  const segmentWidth = Math.min(((Math.PI * MID_RADIUS) / count) * SEGMENT_FILL, SEGMENT_MAX_WIDTH);

  return (
    <figure aria-labelledby={titleId} className={cn("m-0 grid gap-ds-150", className)}>
      <figcaption id={titleId} className={hideTitle ? "sr-only" : "text-heading-xs text-ds-text"}>
        {title}
      </figcaption>
      <div className="relative" style={{ height }}>
        <svg
          aria-hidden="true"
          className="block h-full w-full"
          preserveAspectRatio="xMidYMax meet"
          viewBox={VIEW_BOX}
        >
          {appearance === "solid"
            ? solidArcs(ends).map((arc) => (
                <path
                  key={arc.owner}
                  d={arc.path}
                  fill="none"
                  stroke={paintOf(arc.owner)}
                  strokeWidth={RADIUS.outer - RADIUS.inner}
                />
              ))
            : segmentOwners(ends, count).map((owner, segment) => {
                const share = (segment + 0.5) / count;
                const from = ringPoint(share, RADIUS.inner);
                const to = ringPoint(share, RADIUS.outer);
                return (
                  <line
                    key={segment}
                    className="transition-colors duration-overlay ease-standard"
                    stroke={paintOf(owner)}
                    strokeLinecap="round"
                    strokeWidth={segmentWidth}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                  />
                );
              })}
        </svg>
        {/* With `value`, the data table repeats the center; with `parts`, only the center says it. */}
        <div
          aria-hidden={single || undefined}
          className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center text-center"
        >
          {centerValue === undefined ? null : (
            <span className="text-heading-lg tabular-nums text-ds-text">{centerValue}</span>
          )}
          {centerLabel === undefined ? null : (
            <span className="text-body-sm text-ds-text-subtle">{centerLabel}</span>
          )}
        </div>
      </div>
      {single ? null : (
        // Visual identity only: the data table gives assistive technology the same names.
        <ul
          aria-hidden="true"
          className="m-0 flex list-none flex-wrap justify-center gap-x-ds-200 gap-y-ds-050 p-0 text-body-sm text-ds-text-subtle"
        >
          {parts.map((part, position) => (
            <li key={part.key} className="flex items-center gap-ds-075">
              <span
                className={cn(
                  "size-ds-100 shrink-0 rounded-sm",
                  seriesColor(position, part.color).swatch
                )}
              />
              <span>{part.label}</span>
              <span className="font-medium tabular-nums text-ds-text">{format(part.value)}</span>
            </li>
          ))}
        </ul>
      )}
      {/* A table ignores the 1px box of `sr-only`; the block wrapper clips it, as in the charts. */}
      <div className="sr-only">
        <table>
          <tbody>
            {single ? (
              <tr>
                <th scope="row">{title}</th>
                <td>{centerValue}</td>
                {centerLabel === undefined ? null : <td>{centerLabel}</td>}
              </tr>
            ) : (
              parts.map((part) => (
                <tr key={part.key}>
                  <th scope="row">{part.label}</th>
                  <td>{format(part.value)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export { Gauge };
export type { GaugePart, GaugeProps };
