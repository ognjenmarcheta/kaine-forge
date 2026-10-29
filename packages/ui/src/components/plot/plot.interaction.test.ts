import { describe, expect, it } from "vitest";

import {
  activeOf,
  nextPick,
  sliceAt,
  type PlotPick,
  type PlotPickEvent,
  type PlotPickMode,
  type PlotRing
} from "./plot.interaction";

const none: PlotPick = { transient: null, selected: null };

describe("nextPick", () => {
  it.each<[string, PlotPickMode, PlotPick, PlotPickEvent[], PlotPick, number | null]>([
    [
      "hover shows a point without pinning it",
      "pin",
      none,
      [{ type: "point", index: 2 }],
      { transient: 2, selected: null },
      2
    ],
    [
      "leaving falls back to the pinned point",
      "pin",
      { transient: 4, selected: 1 },
      [{ type: "leave" }],
      { transient: null, selected: 1 },
      1
    ],
    [
      "leaving with nothing pinned shows nothing",
      "pin",
      { transient: 4, selected: null },
      [{ type: "leave" }],
      none,
      null
    ],
    [
      "a click pins the point under the pointer",
      "pin",
      none,
      [{ type: "point", index: 3 }, { type: "commit" }],
      { transient: 3, selected: 3 },
      3
    ],
    [
      "a click on the pinned point unpins it and hides it",
      "pin",
      { transient: 3, selected: 3 },
      [{ type: "commit" }],
      none,
      null
    ],
    [
      "Escape hides and unpins",
      "pin",
      { transient: 2, selected: 1 },
      [{ type: "dismiss" }],
      none,
      null
    ],
    [
      "focus shows the pinned point",
      "pin",
      { transient: null, selected: 4 },
      [{ type: "focus" }],
      { transient: 4, selected: 4 },
      4
    ],
    [
      "focus with nothing pinned shows the first point",
      "pin",
      none,
      [{ type: "focus" }],
      { transient: 0, selected: null },
      0
    ],
    [
      "an arrow from nothing starts at the first point",
      "pin",
      none,
      [{ type: "step", by: 1 }],
      { transient: 0, selected: null },
      0
    ],
    [
      "an arrow steps from the active point and stops at the end",
      "pin",
      { transient: 4, selected: null },
      [{ type: "step", by: 1 }],
      { transient: 4, selected: null },
      4
    ],
    [
      "End goes to the last point",
      "pin",
      none,
      [{ type: "last" }],
      { transient: 4, selected: null },
      4
    ],
    [
      "under scrub the selection follows the pointer",
      "follow",
      { transient: null, selected: 1 },
      [{ type: "point", index: 3 }],
      { transient: 3, selected: 3 },
      3
    ],
    [
      "under scrub leaving keeps the last point",
      "follow",
      { transient: 3, selected: 3 },
      [{ type: "leave" }],
      { transient: null, selected: 3 },
      3
    ],
    [
      "under scrub Escape keeps the selection",
      "follow",
      { transient: 3, selected: 3 },
      [{ type: "dismiss" }],
      { transient: null, selected: 3 },
      3
    ]
  ])("%s", (_, mode, start, events, end, active) => {
    const pick = events.reduce((state, event) => nextPick(state, event, { count: 5, mode }), start);

    expect(pick).toEqual(end);
    expect(activeOf(pick)).toBe(active);
  });
});

describe("sliceAt", () => {
  // A donut around (100, 100) from 40 to 80px: a quarter slice from 12 to 3 o'clock, then the rest.
  const donut: PlotRing = {
    cx: 100,
    cy: 100,
    inner: 40,
    outer: 80,
    slices: [
      { start: 0, end: Math.PI / 2 },
      { start: Math.PI / 2, end: 2 * Math.PI }
    ]
  };
  // A half ring from 9 to 3 o'clock over the top, as a gauge: its slices start before 0.
  const gauge: PlotRing = {
    ...donut,
    slices: [
      { start: -Math.PI / 2, end: 0 },
      { start: 0, end: Math.PI / 2 }
    ]
  };

  it.each<[string, PlotRing, number, number, number]>([
    ["the top right quarter", donut, 150, 50, 0],
    ["below the center", donut, 100, 160, 1],
    ["the left side, past half a turn", donut, 40, 100, 1],
    ["just outside the outer edge", donut, 184, 100, 1],
    ["the hole", donut, 100, 100, -1],
    ["far outside the ring", donut, 100, 5, -1],
    ["the left half of a gauge, before 0 rad", gauge, 40, 90, 0],
    ["the right half of a gauge", gauge, 160, 90, 1],
    ["the open bottom of a gauge", gauge, 100, 160, -1]
  ])("picks %s", (_, ring, x, y, slice) => {
    expect(sliceAt(ring, x, y)).toBe(slice);
  });
});
