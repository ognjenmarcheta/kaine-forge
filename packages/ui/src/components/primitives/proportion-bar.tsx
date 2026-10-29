import * as React from "react";

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
import { usePrefersReducedMotion } from "../plot/plot.motion";
import { PlotTooltip } from "../plot/plot.overlay";

/** A chart slot; segments without one take the slot of their position, in fixed order. */
type ProportionBarColor = "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5" | "chart-6";

const SEGMENT_FILLS: Record<ProportionBarColor, string> = {
  "chart-1": "bg-ds-chart-1",
  "chart-2": "bg-ds-chart-2",
  "chart-3": "bg-ds-chart-3",
  "chart-4": "bg-ds-chart-4",
  "chart-5": "bg-ds-chart-5",
  "chart-6": "bg-ds-chart-6"
};
/** The line color of a hatched part: `bg-hatch` draws its lines in the text color. */
const SEGMENT_LINES: Record<ProportionBarColor, string> = {
  "chart-1": "text-ds-chart-1",
  "chart-2": "text-ds-chart-2",
  "chart-3": "text-ds-chart-3",
  "chart-4": "text-ds-chart-4",
  "chart-5": "text-ds-chart-5",
  "chart-6": "text-ds-chart-6"
};
const SEGMENT_ORDER = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6"] as const;
/** Segments past the sixth share the neutral; fold them into one "Other" segment instead. */
const OVERFLOW_FILL = "bg-ds-border-bold";
const OVERFLOW_LINES = "text-ds-border-bold";

/** The bar thickness, from the theme's spacing steps: 4, 8, 12, or 20px. */
const TRACK_SIZES = {
  sm: "h-ds-050",
  md: "h-ds-100",
  lg: "h-ds-150",
  xl: "h-ds-250"
} as const;

interface ProportionBarSegment {
  key: string;
  /** The translated name of the part. */
  label: string;
  value: number;
  color?: ProportionBarColor;
  /**
   * `"hatch"` draws the part as lines of its color on no fill, such as the part still open. Its
   * legend swatch is hatched and outlined too, so the part is not told by color alone (COLOR-2).
   * @defaultValue "solid"
   */
  fill?: "solid" | "hatch";
}

interface ProportionBarProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  /** Names the bar for assistive technology, such as "Patients by species". */
  label: string;
  /** The parts of the whole, in order; each takes its share of the bar. */
  segments: readonly ProportionBarSegment[];
  /** Formats each value in the legend, the tooltip, and the text for screen readers. */
  valueFormatter?: (value: number) => string;
  /** Shows each part's name and value under the bar; without it they are for screen readers only. */
  legend?: boolean;
  /** @defaultValue "md" */
  size?: keyof typeof TRACK_SIZES;
  /** The bar thickness in pixels, such as 6 or 24, in place of a `size` step. */
  height?: number;
  /**
   * The bar answers the pointer and the keyboard as the charts do (DATA-5): hover, focus, or a
   * tap rings a part and shows its name and value; the arrow keys, Home, and End step through
   * the parts; a click, Enter, or Space pins one, and Escape lets it go. `false` keeps a still
   * picture. @defaultValue true
   */
  interaction?: boolean;
  /** Shows the active part's name and value above the bar. @defaultValue true */
  tooltip?: boolean;
  /** Called with the position in `segments` of the active part, or null, such as to mark a label. */
  onActiveChange?: (position: number | null) => void;
}

function segmentPaint(segment: ProportionBarSegment, position: number) {
  const color = segment.color ?? SEGMENT_ORDER[position];
  if (segment.fill === "hatch") {
    return cn("bg-hatch", color === undefined ? OVERFLOW_LINES : SEGMENT_LINES[color]);
  }
  return color === undefined ? OVERFLOW_FILL : SEGMENT_FILLS[color];
}

/** The box of an interactive bar, in pixels, with the gap between its parts and its direction. */
interface BarBox {
  width: number;
  height: number;
  gap: number;
  rtl: boolean;
}

/** The box of an element whose first child is the bar, read at once and kept current. */
function useBarBox(): [BarBox, React.RefCallback<HTMLDivElement>] {
  const [box, setBox] = React.useState<BarBox>({ width: 0, height: 0, gap: 0, rtl: false });
  const measure = React.useCallback((element: HTMLDivElement | null) => {
    if (element === null) return undefined;
    const read = () => {
      const bounds = element.getBoundingClientRect();
      const bar = element.firstElementChild;
      const style = bar === null ? null : getComputedStyle(bar);
      setBox({
        width: bounds.width,
        height: bounds.height,
        gap: Number.parseFloat(style?.columnGap ?? "") || 0,
        rtl: style?.direction === "rtl"
      });
    };
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [box, measure];
}

/** The drawn part nearest to a pointer: the one under it, else the nearest end. */
function partUnder(event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) {
  const parts = event.currentTarget.firstElementChild?.children ?? [];
  let nearest = -1;
  let distance = Number.POSITIVE_INFINITY;
  Array.from(parts).forEach((part, index) => {
    const bounds = part.getBoundingClientRect();
    const away = Math.max(bounds.left - event.clientX, event.clientX - bounds.right, 0);
    if (away < distance) {
      nearest = index;
      distance = away;
    }
  });
  return nearest;
}

/**
 * Parts of one whole as one horizontal bar, with a surface gap between the parts. A list gives
 * every part's name and value as text, visible with `legend`. The bar is a slider over its
 * parts: hover, focus, or a tap rings a part and shows its name and value above it, and a click
 * or Enter pins it. A part grows or shrinks to a new value with the motion tokens, and snaps
 * under reduced motion.
 */
const ProportionBar = React.forwardRef<HTMLElement, ProportionBarProps>(
  (
    {
      className,
      height,
      interaction = true,
      label,
      legend = false,
      onActiveChange,
      segments,
      size = "md",
      tooltip = true,
      valueFormatter = String,
      ...props
    },
    ref
  ) => {
    // A part of zero has no width to point at; the list still gives its value.
    const drawn = segments.flatMap((segment, position) =>
      segment.value > 0 ? [{ segment, position }] : []
    );
    const interactive = interaction && drawn.length > 0;
    const element = React.useRef<HTMLDivElement | null>(null);
    const [box, measure] = useBarBox();
    const boxRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        element.current = node;
        return measure(node);
      },
      [measure]
    );
    const reducedMotion = usePrefersReducedMotion();

    // The part under the pointer or the keyboard, and the part a click or Enter pinned.
    const [pick, setPick] = React.useState<PlotPick>({ transient: null, selected: null });
    const inRange = (index: number | null) =>
      index !== null && index < drawn.length ? index : null;
    const current: PlotPick = {
      transient: inRange(pick.transient),
      selected: inRange(pick.selected)
    };
    const latest = React.useRef(current);
    latest.current = current;
    const active = interactive ? activeOf(current) : null;
    // The last part shown, so the tooltip keeps its side while it fades out.
    const last = React.useRef(0);
    if (active !== null) last.current = active;
    const dispatch = (...events: PlotPickEvent[]) => {
      const before = latest.current;
      const after = events.reduce(
        (state, event) => nextPick(state, event, { count: drawn.length, mode: "pin" }),
        before
      );
      latest.current = after;
      setPick(after);
      const now = activeOf(after);
      if (now !== activeOf(before)) {
        onActiveChange?.(now === null ? null : (drawn[now]?.position ?? null));
      }
    };
    const onPointer = (event: React.PointerEvent<HTMLDivElement>) => {
      const index = partUnder(event);
      dispatch(index >= 0 ? { type: "point", index } : { type: "leave" });
    };
    const describe = (index: number) => {
      const part = drawn[index]?.segment;
      return part === undefined ? "" : `${part.label}: ${valueFormatter(part.value)}`;
    };

    // The middle of each part in pixels from the start of the box, for the tooltip.
    const total = drawn.reduce((sum, { segment }) => sum + segment.value, 0);
    const free = Math.max(box.width - box.gap * Math.max(drawn.length - 1, 0), 0);
    let start = 0;
    const middles = drawn.map(({ segment }) => {
      const width = total > 0 ? (free * segment.value) / total : 0;
      const middle = start + width / 2;
      start += width + box.gap;
      return box.rtl ? box.width - middle : middle;
    });
    // The tooltip reads the bar as a plot whose points are its parts.
    const plot: PlotContextValue = {
      width: box.width,
      height: box.height,
      inner: {
        left: 0,
        top: 0,
        right: box.width,
        bottom: box.height,
        width: box.width,
        height: box.height
      },
      x: undefined,
      y: undefined,
      id: "",
      activeIndex: active,
      selectedIndex: current.selected,
      activeStop: null,
      highlight: true,
      animate: !reducedMotion
    };
    const registry: PlotRegistry = {
      element,
      stopAxis: "x",
      wantsStops: null,
      registerStops: () => undefined,
      registerRing: () => undefined,
      anchorOf: (index) => {
        const x = middles[index];
        return x === undefined ? null : { x, y: 0 };
      }
    };
    const activePosition = active === null ? null : (drawn[active]?.position ?? null);

    const bar = (
      <div
        aria-hidden="true"
        className={cn("flex gap-ds-025", height === undefined && TRACK_SIZES[size])}
        style={height === undefined ? undefined : { height }}
      >
        {drawn.map(({ segment, position }, index) => (
          <span
            key={segment.key}
            className={cn(
              "basis-ds-0 rounded-full transition-[flex-grow,outline-color] duration-overlay ease-standard",
              segmentPaint(segment, position),
              // The plot's active ring: the text color with a gap of surface around the part.
              interactive && "outline-[1.5px] outline-offset-[1.75px]",
              interactive && (index === active ? "outline-ds-text" : "outline-transparent")
            )}
            style={{ flexGrow: segment.value }}
          />
        ))}
      </div>
    );

    return (
      <figure
        ref={ref}
        aria-label={label}
        className={cn("m-0 grid gap-ds-150", className)}
        {...props}
      >
        {interactive ? (
          <div
            ref={boxRef}
            aria-label={label}
            aria-valuemax={drawn.length}
            aria-valuemin={1}
            aria-valuenow={(active ?? 0) + 1}
            aria-valuetext={describe(active ?? 0)}
            // The pseudo element reaches past a thin bar, so the pointer finds it more easily.
            className="relative touch-pan-y rounded-full before:absolute before:inset-x-ds-0 before:-inset-y-ds-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ds-border-focused"
            role="slider"
            tabIndex={0}
            onBlur={() => dispatch({ type: "leave" })}
            onClick={(event) => {
              const index = partUnder(event);
              if (index >= 0) dispatch({ type: "point", index }, { type: "commit" });
            }}
            onFocus={() => dispatch({ type: "focus" })}
            onKeyDown={(event) => {
              const pickEvent = keyPick(event.key, "x");
              // Escape with nothing to hide stays with the page, such as a dialog that closes.
              if (pickEvent === null || (pickEvent.type === "dismiss" && active === null)) return;
              event.preventDefault();
              dispatch(pickEvent);
            }}
            onPointerDown={onPointer}
            onPointerLeave={() => dispatch({ type: "leave" })}
            onPointerMove={onPointer}
          >
            {bar}
            {tooltip && box.width > 0 ? (
              <PlotContext.Provider value={plot}>
                <PlotRegistryContext.Provider value={registry}>
                  {/* Above the bar, toward its middle, so it stays over the bar's own width. */}
                  <PlotTooltip
                    className="-translate-y-full"
                    offset={{ x: 0, y: -8 }}
                    side={(middles[last.current] ?? 0) < box.width / 2 ? "right" : "left"}
                  >
                    {(index) => {
                      const part = drawn[index]?.segment;
                      return part === undefined ? null : (
                        <>
                          <p className="m-0 text-ds-text-subtle">{part.label}</p>
                          <p className="m-0 font-medium tabular-nums">
                            {valueFormatter(part.value)}
                          </p>
                        </>
                      );
                    }}
                  </PlotTooltip>
                </PlotRegistryContext.Provider>
              </PlotContext.Provider>
            ) : null}
          </div>
        ) : (
          bar
        )}
        <dl
          className={
            legend ? "m-0 flex flex-wrap gap-x-ds-200 gap-y-ds-050 text-body-sm" : "sr-only"
          }
        >
          {segments.map((segment, position) => (
            <div key={segment.key} className="flex items-center gap-ds-075">
              <dt
                className={cn(
                  "flex items-center gap-ds-075 transition-colors duration-control ease-standard",
                  position === activePosition ? "text-ds-text" : "text-ds-text-subtle"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-ds-100 shrink-0 rounded-sm",
                    segmentPaint(segment, position),
                    segment.fill === "hatch" && "border border-current"
                  )}
                />
                {segment.label}
              </dt>
              <dd className="m-0 font-medium tabular-nums text-ds-text">
                {valueFormatter(segment.value)}
              </dd>
            </div>
          ))}
        </dl>
      </figure>
    );
  }
);
ProportionBar.displayName = "ProportionBar";

export { ProportionBar };
export type { ProportionBarColor, ProportionBarProps, ProportionBarSegment };
