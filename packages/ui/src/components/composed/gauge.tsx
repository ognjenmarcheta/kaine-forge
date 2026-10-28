import * as React from "react";

import {
  formatChartValue,
  seriesColor,
  type ChartColor,
  type ChartValueFormatter
} from "./chart.series";
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
  /**
   * Fills to a new value with the motion tokens; under reduced motion it snaps.
   * @defaultValue true
   */
  animate?: boolean;
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
const [VIEW_LEFT, VIEW_TOP, VIEW_WIDTH, VIEW_HEIGHT] = [-4, -4, 208, 106] as const;
const VIEW_BOX = `${VIEW_LEFT} ${VIEW_TOP} ${VIEW_WIDTH} ${VIEW_HEIGHT}`;
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

/** How far past the ring's edges the pointer still picks a part, in view box units. */
const RING_REACH = 6;
/** How far a hovered part grows past the ring, in view box units. */
const ACTIVE_GROWTH = 4;

/**
 * The part under a point in view box units: the position of the part whose arc holds the point,
 * or -1 for the track, the hole, and the space around the ring.
 */
function gaugePartAt(point: { x: number; y: number }, ends: readonly number[]): number {
  const dx = point.x - CENTER.x;
  const dy = CENTER.y - point.y;
  const radius = Math.hypot(dx, dy);
  if (dy < 0 || radius < RADIUS.inner - RING_REACH || radius > RADIUS.outer + RING_REACH) {
    return -1;
  }
  // The share of the half ring from its left end, as `ringPoint` measures it.
  const share = 1 - Math.atan2(dy, dx) / Math.PI;
  return ends.findIndex((end, position) => share <= end && share >= (ends[position - 1] ?? 0));
}

/**
 * A pixel in the gauge's box as a point in view box units: the drawing keeps its aspect ratio,
 * centered across and resting on the bottom edge (`xMidYMax meet`).
 */
function toViewBox(px: number, py: number, width: number, height: number) {
  const scale = Math.min(width / VIEW_WIDTH, height / VIEW_HEIGHT);
  return {
    x: VIEW_LEFT + (px - (width - VIEW_WIDTH * scale) / 2) / scale,
    y: VIEW_TOP + (py - (height - VIEW_HEIGHT * scale)) / scale
  };
}

/** The pixel of a view box point; the inverse of `toViewBox`. */
function fromViewBox(point: { x: number; y: number }, width: number, height: number) {
  const scale = Math.min(width / VIEW_WIDTH, height / VIEW_HEIGHT);
  return {
    x: (width - VIEW_WIDTH * scale) / 2 + (point.x - VIEW_LEFT) * scale,
    y: height - VIEW_HEIGHT * scale + (point.y - VIEW_TOP) * scale
  };
}

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
function segmentOwners(ends: readonly number[], count: number) {
  const lastSegments = ends.map((end) => Math.round(end * count));
  return Array.from({ length: count }, (_, segment) =>
    lastSegments.findIndex((last) => segment < last)
  );
}

/** The arcs of a solid gauge: one per part, then the track, with a gap between neighbors. */
function solidArcs(ends: readonly number[]) {
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
 * A half ring that fills from the left: one value out of `max`, or several `parts` with a
 * legend. Plain SVG, so it renders without the chart library. The center shows a headline, and
 * a visually hidden table gives the data to assistive technology (A11Y-7).
 *
 * Hovering or tapping a part grows it and shows its name and value beside it. With parts, the
 * ring is a slider too: the arrow keys, Home, and End step through the parts, and Enter pins
 * one. A new value fills or empties the ring with the motion tokens, and snaps under reduced
 * motion.
 */
function Gauge(props: GaugeProps) {
  const {
    animate = true,
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
  const element = React.useRef<HTMLDivElement | null>(null);
  const [width, measure] = useBoxWidth();
  const box = React.useCallback(
    (node: HTMLDivElement | null) => {
      element.current = node;
      return measure(node);
    },
    [measure]
  );
  const reducedMotion = usePrefersReducedMotion();
  const moving = animate && !reducedMotion;
  const ends = useTween(partEnds(values, max), { animate: moving, element }).values;
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

  // The part under the pointer or the keyboard; with parts, a click or Enter pins one.
  const [pick, setPick] = React.useState<PlotPick>({ transient: null, selected: null });
  const active = activeOf(pick);
  const dispatch = (event: PlotPickEvent) =>
    setPick((current) => nextPick(current, event, { count: parts.length, mode: "pin" }));
  const partUnder = (
    event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return gaugePartAt(
      toViewBox(
        event.clientX - bounds.left,
        event.clientY - bounds.top,
        bounds.width,
        bounds.height
      ),
      ends
    );
  };
  const onPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const part = partUnder(event);
    dispatch(part >= 0 ? { type: "point", index: part } : { type: "leave" });
  };
  const describe = (position: number) => {
    const part = parts[position];
    return part === undefined
      ? ""
      : `${part.label}: ${single && centerValue !== undefined ? centerValue : format(part.value)}`;
  };
  const anchorOf = (position: number) => {
    const from = position === 0 ? 0 : (ends[position - 1] ?? 0);
    const to = ends[position] ?? from;
    return fromViewBox(ringPoint((from + to) / 2, RADIUS.outer + 8), width, height);
  };
  // The tooltip reads the gauge as a plot whose points are its parts.
  const plot: PlotContextValue = {
    width,
    height,
    inner: { left: 0, top: 0, right: width, bottom: height, width, height },
    x: undefined,
    y: undefined,
    id: "",
    activeIndex: active,
    selectedIndex: pick.selected,
    activeStop: null,
    highlight: true,
    animate: moving
  };
  const registry: PlotRegistry = {
    element,
    stopAxis: "ring",
    wantsStops: null,
    registerStops: () => undefined,
    registerRing: () => undefined,
    anchorOf
  };
  const handlers = {
    onPointerMove: onPointer,
    onPointerDown: onPointer,
    onPointerLeave: () => dispatch({ type: "leave" })
  };
  const slider = single
    ? {}
    : {
        role: "slider",
        tabIndex: 0,
        "aria-label": title,
        "aria-valuemin": 1,
        "aria-valuemax": parts.length,
        "aria-valuenow": (active ?? 0) + 1,
        "aria-valuetext": describe(active ?? 0),
        onClick: (event: React.MouseEvent<HTMLDivElement>) => {
          const part = partUnder(event);
          if (part < 0) return;
          dispatch({ type: "point", index: part });
          dispatch({ type: "commit" });
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
          const pickEvent = keyPick(event.key, "ring");
          if (pickEvent === null || (pickEvent.type === "dismiss" && active === null)) return;
          event.preventDefault();
          dispatch(pickEvent);
        },
        onFocus: () => dispatch({ type: "focus" }),
        onBlur: () => dispatch({ type: "leave" })
      };

  return (
    <figure aria-labelledby={titleId} className={cn("m-0 grid gap-ds-150", className)}>
      <figcaption id={titleId} className={hideTitle ? "sr-only" : "text-heading-xs text-ds-text"}>
        {title}
      </figcaption>
      <div
        ref={box}
        className={cn(
          "relative",
          !single &&
            "touch-pan-y rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ds-border-focused"
        )}
        style={{ height }}
        {...handlers}
        {...slider}
      >
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
                  strokeWidth={
                    RADIUS.outer -
                    RADIUS.inner +
                    (arc.owner >= 0 && arc.owner === active ? ACTIVE_GROWTH * 2 : 0)
                  }
                />
              ))
            : segmentOwners(ends, count).map((owner, segment) => {
                const share = (segment + 0.5) / count;
                const from = ringPoint(share, RADIUS.inner);
                const to = ringPoint(
                  share,
                  RADIUS.outer + (owner >= 0 && owner === active ? ACTIVE_GROWTH : 0)
                );
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
        {width > 0 ? (
          <PlotContext.Provider value={plot}>
            <PlotRegistryContext.Provider value={registry}>
              <PlotTooltip offset={{ x: 4, y: 0 }}>
                {(position) => (
                  <>
                    <p className="m-0 text-ds-text-subtle">{parts[position]?.label}</p>
                    <p className="m-0 font-medium tabular-nums">
                      {single && centerValue !== undefined
                        ? centerValue
                        : format(parts[position]?.value ?? 0)}
                    </p>
                  </>
                )}
              </PlotTooltip>
            </PlotRegistryContext.Provider>
          </PlotContext.Provider>
        ) : null}
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
