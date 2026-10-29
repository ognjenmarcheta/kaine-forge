import { describe, expect, it } from "vitest";

import { applyViewAction, easeView, viewCommandForKey, type ViewConfig } from "./viewport.view";

const config: ViewConfig = {
  initial: { azimuth: 0, polar: Math.PI / 2, zoom: 1 },
  minPolar: 1,
  maxPolar: 2,
  minZoom: 0.75,
  maxZoom: 3
};

describe("viewer keyboard", () => {
  // The keyboard path to every view change (WCAG 2.2 SC 2.1.1). Up and Down without tilt
  // stay with the page, so it still scrolls.
  it.each([
    ["ArrowLeft", false, { type: "rotate", azimuth: Math.PI / 12, polar: 0 }],
    ["ArrowRight", false, { type: "rotate", azimuth: -Math.PI / 12, polar: 0 }],
    ["ArrowUp", true, { type: "rotate", azimuth: 0, polar: -Math.PI / 18 }],
    ["ArrowDown", true, { type: "rotate", azimuth: 0, polar: Math.PI / 18 }],
    ["ArrowUp", false, null],
    ["ArrowDown", false, null],
    ["+", false, { type: "zoom", factor: 1.25 }],
    ["=", false, { type: "zoom", factor: 1.25 }],
    ["-", false, { type: "zoom", factor: 0.8 }],
    ["Home", false, { type: "reset" }],
    ["Escape", false, { type: "clear" }],
    ["a", false, null]
  ])("%s with tilt %s gives %j", (key, tilt, command) => {
    expect(viewCommandForKey(key, tilt)).toEqual(command);
  });
});

describe("view changes", () => {
  it("keeps zoom and tilt inside their limits", () => {
    const start = { azimuth: 0, polar: 1.9, zoom: 2.8 };

    expect(applyViewAction(start, { type: "zoom", factor: 1.25 }, config).zoom).toBe(3);
    expect(applyViewAction(start, { type: "rotate", azimuth: 0, polar: 0.5 }, config).polar).toBe(
      2
    );
    expect(
      applyViewAction({ ...start, zoom: 0.8 }, { type: "zoom", factor: 0.8 }, config).zoom
    ).toBe(0.75);
  });

  it("resets to the start angle nearest the current one, not back through every turn", () => {
    const afterTwoTurns = { azimuth: 4 * Math.PI + 0.4, polar: 1.2, zoom: 2 };

    expect(applyViewAction(afterTwoTurns, { type: "reset" }, config)).toEqual({
      azimuth: 4 * Math.PI,
      polar: Math.PI / 2,
      zoom: 1
    });
  });

  it("moves the camera by elapsed time, so 60 Hz and 120 Hz frames end in the same place", () => {
    const from = { azimuth: 0, polar: 1, zoom: 1 };
    const to = { azimuth: 1, polar: 1, zoom: 1 };

    expect(easeView(from, to, 0.1).azimuth).toBeCloseTo(0.632, 3);
    expect(easeView(easeView(from, to, 0.05), to, 0.05).azimuth).toBeCloseTo(0.632, 3);
  });
});
