// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Gauge, type GaugePart } from "./gauge";

// The gauge is plain SVG and stays in the main bundle; if it imported Recharts, even through a
// chart module, loading this file would throw here and every test below would fail.
vi.mock("recharts", () => {
  throw new Error("Gauge must not load Recharts");
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const projects = (value: number) => `${value} projects`;
const bands: GaugePart[] = [
  { key: "done", label: "Done", value: 9 },
  { key: "over", label: "Over 50%", value: 12, color: "chart-5" },
  { key: "under", label: "Under 50%", value: 9 }
];

/** The paint of each mark from the left end, as runs of [paint, marks in a row]. */
function paintRuns(scope: HTMLElement) {
  const runs: Array<[string | null, number]> = [];
  for (const mark of Array.from(scope.querySelectorAll("svg line, svg path"))) {
    const paint = mark.getAttribute("stroke");
    const last = runs.at(-1);
    if (last !== undefined && last[0] === paint) last[1] += 1;
    else runs.push([paint, 1]);
  }
  return runs;
}

describe("Gauge", () => {
  it.each<[string, ReactElement, string, Array<Array<string | null>>]>([
    [
      "one value, with its share of max in the center",
      <Gauge key="value" title="Treatments today" value={21} max={30} centerLabel="21 of 30" />,
      "Treatments today",
      [["Treatments today", "70%", "21 of 30"]]
    ],
    [
      "parts, one row each",
      <Gauge
        key="parts"
        title="Project completion"
        centerValue="55%"
        parts={bands}
        valueFormatter={projects}
      />,
      "Project completion",
      [
        ["Done", "9 projects"],
        ["Over 50%", "12 projects"],
        ["Under 50%", "9 projects"]
      ]
    ]
  ])("names its figure and lists %s in a table", (_, gauge, name, rows) => {
    act(() => root.render(gauge));

    const titleId = container.querySelector("figure")?.getAttribute("aria-labelledby") ?? "";
    expect(document.getElementById(titleId)?.textContent).toBe(name);
    expect(
      Array.from(container.querySelectorAll("table tr"), (row) =>
        Array.from(row.querySelectorAll("th, td"), (cell) => cell.textContent)
      )
    ).toEqual(rows);
  });

  it.each<[string, ReactElement, Array<[string, number]>]>([
    [
      "a value fills its nearest whole share of the segments, and the track the rest",
      <Gauge key="value" title="Sales growth" value={70.8} />,
      [
        ["var(--ds-chart-1)", 17],
        ["var(--ds-chart-grid)", 7]
      ]
    ],
    [
      "a value takes its own color",
      <Gauge key="color" title="Sales growth" value={50} color="success" segments={12} />,
      [
        ["var(--ds-border-success)", 6],
        ["var(--ds-chart-grid)", 6]
      ]
    ],
    [
      "parts fill their segments in order, each in its own color",
      <Gauge key="parts" title="Project completion" parts={bands} segments={30} />,
      [
        ["var(--ds-chart-1)", 9],
        ["var(--ds-chart-5)", 12],
        ["var(--ds-chart-3)", 9]
      ]
    ],
    [
      "a solid gauge draws one arc per part, then the track for the rest of max",
      <Gauge key="solid" title="Project completion" parts={bands} max={40} appearance="solid" />,
      [
        ["var(--ds-chart-1)", 1],
        ["var(--ds-chart-5)", 1],
        ["var(--ds-chart-3)", 1],
        ["var(--ds-chart-grid)", 1]
      ]
    ]
  ])("%s", (_, gauge, runs) => {
    act(() => root.render(gauge));

    expect(paintRuns(container)).toEqual(runs);
  });

  it("shows the part under the pointer, and the arrow keys step through the parts", () => {
    // The box matches the view box, so a pixel is a view box unit 4px to the right and down.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 208, 106)
    );
    act(() =>
      root.render(
        <Gauge height={106} parts={bands} title="Project completion" valueFormatter={projects} />
      )
    );
    const slider = () => container.querySelector<HTMLElement>('[role="slider"]');

    // 15% along the ring from its left end, mid-band: in Done, which fills the first 30%.
    act(() => {
      slider()?.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 28, clientY: 65, bubbles: true })
      );
    });
    expect(slider()?.getAttribute("aria-valuetext")).toBe("Done: 9 projects");
    expect(slider()?.querySelector(":scope > div[aria-hidden='true']")?.textContent).toBe(
      "Done9 projects"
    );

    act(() => {
      slider()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(slider()?.getAttribute("aria-valuetext")).toBe("Over 50%: 12 projects");
  });

  it("fills to a new value over time", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }));
    act(() => root.render(<Gauge title="Sales growth" value={20} />));
    act(() => root.render(<Gauge title="Sales growth" value={80} />));

    act(() => {
      vi.advanceTimersByTime(48);
    });
    const filling = paintRuns(container)[0]?.[1] ?? 0;
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // 20 of 100 fills 5 of the 24 segments, and 80 fills 19.
    expect(filling).toBeGreaterThan(5);
    expect(filling).toBeLessThan(19);
    expect(paintRuns(container)[0]).toEqual(["var(--ds-chart-1)", 19]);
  });
});
