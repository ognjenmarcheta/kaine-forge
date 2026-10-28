import * as React from "react";

/** A duration and its easing curve, read from the motion tokens. */
export interface PlotMotion {
  duration: number;
  ease: (progress: number) => number;
}

/** The pace of a tween: `"overlay"` for data that changes, `"control"` for a mark that follows. */
export type PlotPace = "control" | "overlay";

// The token values, for an element outside a theme (or a test page without the stylesheet).
const FALLBACK_DURATION: Record<PlotPace, number> = { control: 120, overlay: 180 };
const FALLBACK_EASING = [0.23, 1, 0.32, 1] as const;

/** The CSS `cubic-bezier(x1, y1, x2, y2)` curve as a function of progress from 0 to 1. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, t: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  const slope = (a: number, b: number, t: number) =>
    3 * a * (1 - t) ** 2 + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t ** 2;
  return (progress: number): number => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    // Newton steps find the curve parameter whose x is the progress; bisection backs them up.
    let t = progress;
    for (let step = 0; step < 6; step++) {
      const gradient = slope(x1, x2, t);
      if (Math.abs(gradient) < 1e-6) break;
      t -= (at(x1, x2, t) - progress) / gradient;
    }
    if (!(t >= 0 && t <= 1) || Math.abs(at(x1, x2, t) - progress) > 1e-4) {
      let low = 0;
      let high = 1;
      t = progress;
      for (let step = 0; step < 30; step++) {
        if (at(x1, x2, t) < progress) low = t;
        else high = t;
        t = (low + high) / 2;
      }
    }
    return at(y1, y2, t);
  };
}

function parseDuration(text: string): number | undefined {
  const match = /^\s*([\d.]+)(ms|s)\s*$/.exec(text);
  if (match === null) return undefined;
  return Number(match[1]) * (match[2] === "s" ? 1000 : 1);
}

function parseEasing(text: string): PlotMotion["ease"] | undefined {
  if (text.trim() === "linear") return (progress) => progress;
  const match = /cubic-bezier\(([^)]+)\)/.exec(text);
  const points = match?.[1]?.split(",").map(Number);
  if (points?.length !== 4 || points.some((point) => !Number.isFinite(point))) return undefined;
  const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = points;
  return cubicBezier(x1, y1, x2, y2);
}

/**
 * The motion tokens at `element` (`--ds-motion-control` or `--ds-motion-overlay`, and
 * `--ds-motion-easing`), so a theme sets the pace of its charts too.
 */
export function readMotion(element: Element | null, pace: PlotPace): PlotMotion {
  const style =
    element === null || typeof getComputedStyle !== "function" ? null : getComputedStyle(element);
  return {
    duration:
      parseDuration(style?.getPropertyValue(`--ds-motion-${pace}`) ?? "") ??
      FALLBACK_DURATION[pace],
    ease:
      parseEasing(style?.getPropertyValue("--ds-motion-easing") ?? "") ??
      cubicBezier(...FALLBACK_EASING)
  };
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Without media queries there is no way to ask, so values snap, as under reduced motion. */
function reducedMotionNow(): boolean {
  return typeof window.matchMedia !== "function" || window.matchMedia(REDUCED_MOTION).matches;
}

/**
 * Whether the person asked for reduced motion (MOTION-3). Unlike `useMediaQuery`, it is right on
 * the first render and safe where `matchMedia` is missing, and it follows the setting live.
 */
export function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, () => true);
}

/** What a tweening mark draws on this frame. */
export interface PlotTweenFrame {
  /** The values to draw: on their way from the old values to `target`, or `target` itself. */
  values: readonly number[];
  /**
   * The old values while they fade out, when the number of values changed (a line with more
   * points, more bars); null otherwise. Draw them at `1 - fade` and `values` at `fade`.
   */
  previous: readonly number[] | null;
  fade: number;
}

export interface PlotTweenOptions {
  /** False snaps to each new target, as under reduced motion. */
  animate: boolean;
  /** The element whose motion tokens set the pace; read when a tween starts. */
  element: React.RefObject<Element | null>;
  /** @defaultValue "overlay" */
  pace?: PlotPace;
  /** A change of this key snaps instead of tweening, such as a new plot size. */
  reset?: string;
  /**
   * Where a value that is new on a change of count starts, such as the baseline for a new bar's
   * top. Without it a change of count cross-fades the old values into the new ones.
   */
  enter?: (index: number, target: number) => number;
}

const same = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

/**
 * Tweens numbers from their old values to `target` with requestAnimationFrame and the motion
 * tokens, so a mark moves to new data instead of jumping (DATA-5). A tween that starts while
 * another runs starts from what is on screen. Values that were not finite snap. SVG `d`
 * attributes are drawn from these values each frame, because CSS cannot transition `d` in
 * WebKitGTK, which the desktop app runs on.
 */
export function useTween(
  target: readonly number[],
  { animate, element, enter, pace = "overlay", reset = "" }: PlotTweenOptions
): PlotTweenFrame {
  const [frame, setFrame] = React.useState<PlotTweenFrame>(() => ({
    values: target,
    previous: null,
    fade: 1
  }));
  const shown = React.useRef(frame);
  shown.current = frame;
  const goal = React.useRef(target);
  const lastReset = React.useRef(reset);
  const request = React.useRef(0);

  // The target as text, so a new array with the same values starts nothing.
  const key = target.join(",");
  React.useLayoutEffect(() => {
    const from = shown.current;
    if (same(goal.current, target) && lastReset.current === reset) return;
    goal.current = target;
    const snap = !animate || lastReset.current !== reset;
    lastReset.current = reset;
    cancelAnimationFrame(request.current);
    if (snap) {
      setFrame({ values: target, previous: null, fade: 1 });
      return;
    }
    const counted = from.values.length === target.length || enter !== undefined;
    const start = counted
      ? target.map((value, index) => {
          const old = from.values[index];
          if (old !== undefined && Number.isFinite(old)) return old;
          return old === undefined && enter !== undefined ? enter(index, value) : value;
        })
      : from.values;
    const motion = readMotion(element.current, pace);
    let began: number | undefined;
    const tick = (now: number) => {
      began ??= now;
      const progress = motion.duration > 0 ? Math.min((now - began) / motion.duration, 1) : 1;
      const eased = motion.ease(progress);
      setFrame(
        counted
          ? {
              values: target.map((value, index) => {
                const old = start[index] ?? value;
                return Number.isFinite(value) ? old + (value - old) * eased : value;
              }),
              previous: null,
              fade: 1
            }
          : { values: target, previous: progress < 1 ? start : null, fade: eased }
      );
      if (progress < 1) request.current = requestAnimationFrame(tick);
    };
    request.current = requestAnimationFrame(tick);
    // `key` stands for `target`: the effect runs when the values change, not the array.
  }, [key, animate, reset, pace]);
  React.useEffect(() => () => cancelAnimationFrame(request.current), []);

  // Until the first frame, a changed count starts the fade from the old values; without
  // animation the effect above snaps before paint.
  if (frame.values.length !== target.length && frame.previous === null) {
    if (!animate) return { values: target, previous: null, fade: 1 };
    if (enter === undefined) return { values: target, previous: frame.values, fade: 0 };
    const old = frame.values;
    return {
      values: target.map((value, index) => old[index] ?? enter(index, value)),
      previous: null,
      fade: 1
    };
  }
  return frame;
}
