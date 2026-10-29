/**
 * The points a plot can pick, as indexes from 0. The *active* point is transient: hover, focus,
 * or touch. The *selected* point is pinned: click, tap, Enter, or Space.
 */
export interface PlotPick {
  /** The point under the pointer or the keyboard, or null when neither is on the plot. */
  transient: number | null;
  /** The pinned point, or null. */
  selected: number | null;
}

/**
 * `"pin"`: the pointer and the arrow keys move the active point, and a click or Enter pins it.
 * `"follow"`: the selection moves with the pointer and the arrow keys, as `scrub` always did.
 */
export type PlotPickMode = "pin" | "follow";

export type PlotPickEvent =
  /** The pointer is over a point. */
  | { type: "point"; index: number }
  /** The pointer left the plot, or the plot lost focus. */
  | { type: "leave" }
  | { type: "step"; by: number }
  | { type: "first" }
  | { type: "last" }
  /** The plot took focus. */
  | { type: "focus" }
  /** Pins the active point; on the pinned point, a pin mode plot unpins it. */
  | { type: "commit" }
  /** Escape: hides the active point; a pin mode plot also unpins. */
  | { type: "dismiss" };

/** The point that marks and overlays show: the transient one, else the selected one. */
export function activeOf(pick: PlotPick): number | null {
  return pick.transient ?? pick.selected;
}

function clamp(index: number, count: number): number {
  return Math.min(Math.max(index, 0), count - 1);
}

/** The pick after one event, for a plot of `count` points. */
export function nextPick(
  pick: PlotPick,
  event: PlotPickEvent,
  { count, mode }: { count: number; mode: PlotPickMode }
): PlotPick {
  if (count <= 0) return { transient: null, selected: null };
  const move = (index: number): PlotPick => {
    const transient = clamp(index, count);
    return { transient, selected: mode === "follow" ? transient : pick.selected };
  };

  switch (event.type) {
    case "point":
      return move(event.index);
    case "step":
      return move((activeOf(pick) ?? -event.by) + event.by);
    case "first":
      return move(0);
    case "last":
      return move(count - 1);
    case "leave":
      return { transient: null, selected: pick.selected };
    case "focus":
      return { transient: pick.transient ?? pick.selected ?? 0, selected: pick.selected };
    case "commit": {
      const active = activeOf(pick);
      if (active === null) return pick;
      if (mode === "pin" && active === pick.selected) return { transient: null, selected: null };
      return { transient: active, selected: active };
    }
    case "dismiss":
      return { transient: null, selected: mode === "pin" ? null : pick.selected };
  }
}

/**
 * The event of a key, or null for a key the plot leaves alone. Right and Up step forward, as on a
 * slider; on categories down the y axis, Down steps forward too, so the keys follow the rows.
 */
export function keyPick(key: string, axis: "x" | "y" | "ring"): PlotPickEvent | null {
  switch (key) {
    case "ArrowRight":
      return { type: "step", by: 1 };
    case "ArrowLeft":
      return { type: "step", by: -1 };
    case "ArrowUp":
      return { type: "step", by: axis === "y" ? -1 : 1 };
    case "ArrowDown":
      return { type: "step", by: axis === "y" ? 1 : -1 };
    case "Home":
      return { type: "first" };
    case "End":
      return { type: "last" };
    case "Enter":
    case " ":
      return { type: "commit" };
    case "Escape":
      return { type: "dismiss" };
    default:
      return null;
  }
}

/** One slice of a ring, in radians clockwise from 12 o'clock. */
export interface PlotSliceAngles {
  start: number;
  end: number;
}

/** The ring that slices sit on, in pixels from the plot's top left corner. */
export interface PlotRing {
  cx: number;
  cy: number;
  inner: number;
  outer: number;
  slices: readonly PlotSliceAngles[];
}

/**
 * The angles of slices sized by `weights`, from `start` to `end`. Equal weights give equal
 * segments; a zero total gives empty slices at the start.
 */
export function sliceAngles(
  weights: readonly number[],
  start: number,
  end: number
): PlotSliceAngles[] {
  const total = weights.reduce((sum, weight) => sum + Math.max(weight, 0), 0);
  let angle = start;
  return weights.map((weight) => {
    const from = angle;
    angle += total > 0 ? ((end - start) * Math.max(weight, 0)) / total : 0;
    return { start: from, end: angle };
  });
}

/** How far outside the ring the pointer still picks a slice, in pixels. */
const RING_REACH = 6;

/**
 * The slice under a pixel, or -1 when the pixel is in the hole, outside the ring, or in the open
 * part of a partial ring.
 */
export function sliceAt(ring: PlotRing, x: number, y: number): number {
  const dx = x - ring.cx;
  const dy = y - ring.cy;
  const radius = Math.hypot(dx, dy);
  if (radius > ring.outer + RING_REACH || radius < Math.max(ring.inner - RING_REACH, 0)) return -1;
  // Clockwise from 12 o'clock, as d3.arc measures; a slice may start before or after -π.
  const angle = Math.atan2(dx, -dy);
  return ring.slices.findIndex((slice) =>
    [-2 * Math.PI, 0, 2 * Math.PI].some((turn) => {
      const at = angle + turn;
      return slice.end > slice.start && at >= slice.start && at < slice.end;
    })
  );
}

/** A point just outside the middle of a slice, where an overlay for it can anchor. */
export function sliceAnchor(ring: PlotRing, index: number, gap = 8): { x: number; y: number } {
  const slice = ring.slices[index];
  if (slice === undefined) return { x: ring.cx, y: ring.cy };
  const middle = (slice.start + slice.end) / 2;
  const radius = ring.outer + gap;
  return { x: ring.cx + radius * Math.sin(middle), y: ring.cy - radius * Math.cos(middle) };
}

/** The data of a plot as text: one row per point, one column per series. */
export interface PlotTableRows {
  columns: readonly string[];
  rows: readonly { header: string; cells: readonly string[] }[];
}

/**
 * A point said from its table row, such as "Fri: 58%" or "Mon: Visits 120, Sign-ups 42". Empty
 * cells are left out; undefined when the row does not exist.
 */
export function describeRow(table: PlotTableRows, index: number): string | undefined {
  const row = table.rows[index];
  if (row === undefined) return undefined;
  const cells = row.cells.flatMap((cell, column) =>
    cell === "" ? [] : [{ cell, column: table.columns[column] ?? "" }]
  );
  if (row.cells.length === 1) return `${row.header}: ${cells[0]?.cell ?? ""}`;
  return `${row.header}: ${cells.map(({ cell, column }) => (column === "" ? cell : `${column} ${cell}`)).join(", ")}`;
}
