// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Plot } from "./plot";
import { PlotAxis, PlotBand, PlotDots } from "./plot.marks";

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
});
