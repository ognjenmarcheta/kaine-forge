// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Plot, type PlotProps } from "./plot";
import { PlotArcs, PlotAxis, PlotBand, PlotBars, PlotDots } from "./plot.marks";

let container: HTMLDivElement;
let root: Root;

/** Where the plot sits on the page: jsdom lays nothing out, so the measured box is set here. */
const PLOT_BOX = { left: 100, width: 400 };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(PLOT_BOX.left, 0, PLOT_BOX.width, 120)
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const visits = [12, 18, 9, 22, 15];

/**
 * Five days on a point scale. With 40px margins on a 400px plot, the days sit at 40, 120, 200,
 * 280, and 360px from the plot's left edge.
 */
function VisitsPlot({ start }: { start: number }) {
  const [selected, setSelected] = useState(start);

  return (
    <Plot
      height={120}
      margin={{ left: 40, right: 40 }}
      title="Visits this week"
      x={{ type: "point", domain: days }}
      y={{ type: "linear", domain: [0, 25] }}
      scrub={{
        stops: days,
        selectedIndex: selected,
        onSelect: setSelected,
        label: "Pick a day",
        describe: (index) => `${days[index]}: ${visits[index]} visits`
      }}
      table={{
        columns: ["Visits"],
        rows: days.map((day, index) => ({ header: day, cells: [String(visits[index])] }))
      }}
    >
      <PlotDots data={visits} x={(_, index) => days[index] ?? ""} y={(value) => value} />
    </Plot>
  );
}

const slider = () => container.querySelector<HTMLElement>('[role="slider"]');

describe("Plot", () => {
  it("names its figure, hides the drawing, and gives the data as a table", () => {
    act(() => root.render(<VisitsPlot start={0} />));

    const titleId = container.querySelector("figure")?.getAttribute("aria-labelledby") ?? "";
    expect(document.getElementById(titleId)?.textContent).toBe("Visits this week");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(
      Array.from(container.querySelectorAll("table tr"), (row) =>
        Array.from(row.querySelectorAll("th, td"), (cell) => cell.textContent)
      )
    ).toEqual([
      ["", "Visits"],
      ["Mon", "12"],
      ["Tue", "18"],
      ["Wed", "9"],
      ["Thu", "22"],
      ["Fri", "15"]
    ]);
  });

  it.each([
    [0, "ArrowRight", "Tue: 18 visits"],
    [2, "ArrowLeft", "Tue: 18 visits"],
    [2, "ArrowUp", "Thu: 22 visits"],
    [2, "ArrowDown", "Tue: 18 visits"],
    [1, "End", "Fri: 15 visits"],
    [3, "Home", "Mon: 12 visits"],
    [0, "ArrowLeft", "Mon: 12 visits"],
    [4, "ArrowRight", "Fri: 15 visits"]
  ])("from point %i, %s selects %s and stops at the ends", (start, key, selected) => {
    act(() => root.render(<VisitsPlot start={start} />));

    act(() => {
      slider()?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });

    expect(slider()?.getAttribute("aria-valuetext")).toBe(selected);
  });

  it.each([
    [150, "Tue: 18 visits"],
    [330, "Fri: 15 visits"]
  ])("a pointer %ipx into the plot selects the nearest point, %s", (offset, selected) => {
    act(() => root.render(<VisitsPlot start={2} />));

    act(() => {
      slider()?.dispatchEvent(
        new MouseEvent("pointermove", { clientX: PLOT_BOX.left + offset, bubbles: true })
      );
    });

    expect(slider()?.getAttribute("aria-valuetext")).toBe(selected);
  });

  it("closes a band back along its lower series, reading each datum with its own index", () => {
    const steps = ["a", "b", "c"];
    const atStep = (_: unknown, index: number): string => steps[index] ?? "";
    act(() =>
      root.render(
        <Plot
          height={100}
          table={{ columns: [], rows: [] }}
          title="Range"
          x={{ type: "point", domain: steps }}
          y={{ type: "linear", domain: [0, 10] }}
        >
          <PlotBand
            fill={{ type: "solid", color: "chart-1" }}
            lower={{ data: [1, 2, 3], x: atStep, y: (value) => value }}
            upper={{ data: [5, 6, 7], x: atStep, y: (value) => value }}
          />
        </Plot>
      )
    );

    // a, b, and c sit at 0, 200, and 400px; values run from 100px at 0 up to 0px at 10.
    expect(container.querySelector("svg path")?.getAttribute("d")).toBe(
      "M0,50L200,40L400,30L400,70L200,80L0,90Z"
    );
  });

  it("leaves out crowded axis labels but keeps the first and the last", () => {
    act(() =>
      root.render(
        <Plot
          height={100}
          table={{ columns: [], rows: [] }}
          title="Steps"
          x={{ type: "linear", domain: [0, 10] }}
          y={{ type: "linear", domain: [0, 1] }}
        >
          <PlotAxis
            axis="x"
            format={String}
            minSpacing={100}
            values={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
          />
        </Plot>
      )
    );

    // The steps sit 40px apart, so every third one fits; 10 takes the place of 9.
    expect(
      Array.from(container.querySelectorAll("svg text"), (label) => label.textContent)
    ).toEqual(["0", "3", "6", "10"]);
  });

  describe("picking points", () => {
    const visitsTable = {
      columns: ["Visits"],
      rows: days.map((day, index) => ({ header: day, cells: [String(visits[index])] }))
    };
    const atDay = (_: unknown, index: number): string => days[index] ?? "";
    // Five 80px bands from the plot's left edge: Wed runs from 160 to 240px.
    const wednesday = PLOT_BOX.left + 200;

    function VisitBars({
      highlight,
      scrub = false,
      table = visitsTable
    }: {
      highlight?: boolean;
      scrub?: boolean;
      table?: PlotProps["table"];
    }) {
      const [selected, setSelected] = useState(0);
      return (
        <Plot
          height={120}
          table={table}
          title="Visits this week"
          x={{ type: "band", domain: days, paddingInner: 0 }}
          y={{ type: "linear", domain: [0, 25] }}
          {...(scrub
            ? {
                scrub: {
                  stops: days,
                  selectedIndex: selected,
                  onSelect: setSelected,
                  label: "Pick a day",
                  describe: (index: number) => days[index] ?? ""
                }
              }
            : {})}
        >
          <PlotBars
            data={visits}
            fill={{ type: "solid", color: "chart-1" }}
            x={atDay}
            y={(value) => value}
            {...(highlight === undefined ? {} : { highlight })}
          />
        </Plot>
      );
    }

    const pointer = (type: string, clientX: number, clientY = 60) =>
      act(() => {
        slider()?.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true }));
      });
    /** The rings drawn in the text color around an active mark. */
    const rings = () => container.querySelectorAll('svg path[stroke="var(--ds-text)"]').length;
    const tooltip = () => slider()?.querySelector(":scope > div[aria-hidden='true']")?.textContent;

    it("shows the hovered point from its table row and keeps a clicked one after the pointer leaves", () => {
      act(() => root.render(<VisitBars />));

      pointer("pointermove", wednesday);
      expect(slider()?.getAttribute("aria-valuetext")).toBe("Wed: 9");
      expect(tooltip()).toBe("Wed9");

      pointer("click", wednesday);
      act(() => {
        slider()?.dispatchEvent(
          new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body })
        );
      });
      expect(slider()?.getAttribute("aria-valuetext")).toBe("Wed: 9");
      expect(rings()).toBe(1);
    });

    it.each<[string, { highlight?: boolean; scrub?: boolean }, number]>([
      ["a bar rings the active point by default", {}, 1],
      ["highlight={false} opts a mark out", { highlight: false }, 0],
      ["under scrub the caller draws the selection", { scrub: true }, 0]
    ])("%s", (_, props, count) => {
      act(() => root.render(<VisitBars {...props} />));

      pointer("pointermove", wednesday);

      expect(rings()).toBe(count);
    });

    it("stays a still picture when its table has no row per point", () => {
      act(() =>
        root.render(
          <VisitBars table={{ columns: [], rows: [{ header: "Visits", cells: ["76"] }] }} />
        )
      );

      expect(slider()).toBeNull();
    });

    it("picks rows down the y axis by the pointer's height and the arrow keys", () => {
      const regions = ["North", "South", "East"];
      act(() =>
        root.render(
          <Plot
            height={120}
            table={{
              columns: ["Stores"],
              rows: regions.map((region, index) => ({ header: region, cells: [String(index + 5)] }))
            }}
            title="Stores by region"
            x={{ type: "linear", domain: [0, 10] }}
            y={{ type: "band", domain: regions, paddingInner: 0 }}
          >
            <PlotDots data={[5, 6, 7]} x={(value) => value} y={(_, index) => index} />
          </Plot>
        )
      );

      // Three 40px rows: 70px down is South.
      pointer("pointermove", PLOT_BOX.left + 10, 70);
      expect(slider()?.getAttribute("aria-valuetext")).toBe("South: 6");
      act(() => {
        slider()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      });
      expect(slider()?.getAttribute("aria-valuetext")).toBe("East: 7");
    });

    it("picks slices of a ring by angle, and the arrow keys step through them", () => {
      act(() =>
        root.render(
          <Plot
            height={120}
            table={{
              columns: ["Cases"],
              rows: ["Flu", "Cold", "Other"].map((name, index) => ({
                header: name,
                cells: [String([1, 1, 2][index])]
              }))
            }}
            title="Cases"
          >
            <PlotArcs
              endAngle={2 * Math.PI}
              fill={() => ({ type: "solid", color: "chart-1" })}
              innerRatio={0.5}
              startAngle={0}
              values={[1, 1, 2]}
            />
          </Plot>
        )
      );

      // The ring sits at (200, 60) with a 60px radius; up and right of the center is Flu.
      pointer("pointermove", PLOT_BOX.left + 230, 30);
      expect(slider()?.getAttribute("aria-valuetext")).toBe("Flu: 1");
      act(() => {
        slider()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      });
      expect(slider()?.getAttribute("aria-valuetext")).toBe("Cold: 1");
    });
  });

  describe("data transitions", () => {
    function OneBar({ animate, value }: { animate?: boolean; value: number }) {
      return (
        <Plot
          animate={animate ?? true}
          height={120}
          interaction={false}
          table={{ columns: [], rows: [] }}
          title="One bar"
          x={{ type: "band", domain: ["a"], paddingInner: 0 }}
          y={{ type: "linear", domain: [0, 25] }}
        >
          <PlotBars
            data={[value]}
            fill={{ type: "solid", color: "chart-1" }}
            x={() => "a"}
            y={(datum) => datum}
          />
        </Plot>
      );
    }

    /** The pixel of the bar's top: 72 at 10, 24 at 20. */
    const barTop = () =>
      Number(/V([\d.]+)/.exec(container.querySelector("svg path")?.getAttribute("d") ?? "")?.[1]);

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const reducedMotion = (reduce: boolean) =>
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: reduce && query === "(prefers-reduced-motion: reduce)",
        addEventListener: () => undefined,
        removeEventListener: () => undefined
      }));

    it("tweens a bar to its new value with the motion tokens", () => {
      reducedMotion(false);
      act(() => root.render(<OneBar value={10} />));
      act(() => root.render(<OneBar value={20} />));

      act(() => {
        vi.advanceTimersByTime(64);
      });
      const halfway = barTop();
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(halfway).toBeGreaterThan(24);
      expect(halfway).toBeLessThan(72);
      expect(barTop()).toBeCloseTo(24, 6);
    });

    it.each<[string, boolean, boolean]>([
      ["reduced motion", true, true],
      ["animate={false}", false, false]
    ])("with %s a new value snaps", (_, reduce, animate) => {
      reducedMotion(reduce);
      act(() => root.render(<OneBar animate={animate} value={10} />));
      act(() => root.render(<OneBar animate={animate} value={20} />));

      expect(barTop()).toBeCloseTo(24, 6);
    });
  });

  it.each<[string, "end" | "both", number, string]>([
    [
      "the second series takes the right half of its band",
      "end",
      0,
      "M100,120V60A0,0 0 0 1 100,60H200A0,0 0 0 1 200,60V120Z"
    ],
    [
      'round="both" rounds the baseline end too',
      "both",
      10,
      "M100,70A10,10 0 0 1 110,60H190A10,10 0 0 1 200,70V110A10,10 0 0 1 190,120H110A10,10 0 0 1 100,110Z"
    ]
  ])("groups bars by series: %s", (_, round, radius, path) => {
    act(() =>
      root.render(
        <Plot
          height={120}
          interaction={false}
          table={{ columns: [], rows: [] }}
          title="Grouped"
          x={{ type: "band", domain: ["a", "b"], paddingInner: 0 }}
          y={{ type: "linear", domain: [0, 10] }}
        >
          <PlotBars
            data={[5]}
            fill={{ type: "solid", color: "chart-2" }}
            group={{ index: 1, count: 2, padding: 0 }}
            radius={radius}
            round={round}
            x={() => "a"}
            y={(value) => value}
          />
        </Plot>
      )
    );

    // Band a runs from 0 to 200px; its second half is 100 to 200px, and 5 sits 60px down.
    expect(container.querySelector("svg path")?.getAttribute("d")).toBe(path);
  });
});
