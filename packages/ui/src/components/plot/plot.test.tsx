// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Plot, usePlot, type PlotProps } from "./plot";
import {
  PlotArcs,
  PlotAxis,
  PlotBand,
  PlotBars,
  PlotDots,
  PlotLine,
  usePlotTween,
  type PlotArcsProps
} from "./plot.marks";
import { PlotAnchor, PlotLegend, type PlotAnchorProps } from "./plot.overlay";

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

  it.each<
    [string, { align?: "start"; format: (value: string | number | Date) => string }, string[][]]
  >([
    ["by default y labels end left of the drawing area", { format: String }, [["40", "0", "end"]]],
    [
      'align="start" starts y labels at the plot\'s left edge',
      { align: "start", format: String },
      [["0", "0", "start"]]
    ],
    [
      "a line break splits a label into lines",
      { format: () => "Anna\nKowalski" },
      [
        ["40", "-0.6em", "Anna"],
        ["40", "1.2em", "Kowalski"]
      ]
    ]
  ])("PlotAxis: %s", (_, props, labels) => {
    act(() =>
      root.render(
        <Plot
          height={100}
          margin={{ left: 48 }}
          table={{ columns: [], rows: [] }}
          title="Steps"
          x={{ type: "linear", domain: [0, 10] }}
          y={{ type: "linear", domain: [0, 1] }}
        >
          <PlotAxis axis="y" offset={8} values={[0]} {...props} />
        </Plot>
      )
    );

    const text = container.querySelector("svg text");
    const lines = text?.querySelectorAll("tspan") ?? [];
    expect(
      lines.length === 0
        ? [[text?.getAttribute("x"), text?.textContent, text?.getAttribute("text-anchor")]]
        : Array.from(lines, (line) => [
            line.getAttribute("x"),
            line.getAttribute("dy"),
            line.textContent
          ])
    ).toEqual(labels);
  });

  it("extends a line along its end segments to the edges of the drawing area", () => {
    act(() =>
      root.render(
        <Plot
          height={120}
          interaction={false}
          table={{ columns: [], rows: [] }}
          title="Trend"
          x={{ type: "linear", domain: [0, 10] }}
          y={{ type: "linear", domain: [0, 10] }}
        >
          <PlotLine data={[2, 5, 8]} extend x={(value) => value} y={(value) => value} />
        </Plot>
      )
    );

    // The points sit at (80, 96), (200, 60), and (320, 24); both ends fall 0.3px per pixel.
    expect(container.querySelector("svg path")?.getAttribute("d")).toBe(
      "M0,120L80,96L200,60L320,24L400,0"
    );
  });

  describe("PlotArcs", () => {
    /** Two slices of a ring around (200, 60): the first from 9 to 3 o'clock over the top. */
    const renderRing = (props: Partial<PlotArcsProps>) =>
      act(() =>
        root.render(
          <Plot height={120} interaction={false} table={{ columns: [], rows: [] }} title="Ring">
            <PlotArcs
              endAngle={1.5 * Math.PI}
              fill={() => ({ type: "solid", color: "chart-1" })}
              padAngle={0}
              startAngle={-Math.PI / 2}
              values={[1, 1, 0]}
              {...props}
            />
          </Plot>
        )
      );
    const slices = () => Array.from(container.querySelectorAll("svg path"));

    it("reaches each slice out to its own radius, as a polar area chart does", () => {
      renderRing({ innerRatio: 0, radii: [1, 0.5, 1] });
      // The first arc of each slice's path is its outer edge: "A<radius>,<radius>".
      const outer = slices().map((slice) =>
        Number(/A([\d.]+),/.exec(slice.getAttribute("d") ?? "")?.[1])
      );

      expect((outer[1] ?? 0) / (outer[0] ?? 1)).toBeCloseTo(0.5, 6);
    });

    it("moves a chosen slice out along its middle angle", () => {
      renderRing({ offset: (index) => (index === 0 ? 10 : 0) });

      expect(slices().map((slice) => slice.getAttribute("transform"))).toEqual([
        "translate(0 -10)",
        null,
        null
      ]);
    });

    it("draws an edge around the slices that ask for one", () => {
      renderRing({ stroke: (index) => (index === 1 ? { color: "surface", width: 2 } : undefined) });

      expect(
        slices().map((slice) => [slice.getAttribute("stroke"), slice.getAttribute("stroke-width")])
      ).toEqual([
        [null, null],
        ["var(--ds-surface-raised)", "2"],
        [null, null]
      ]);
    });

    it("labels each slice that has a share, and no empty one", () => {
      renderRing({ label: (index) => ["50%", "50%", "0%"][index] ?? "" });

      expect(
        Array.from(container.querySelectorAll("svg text"), (label) => label.textContent)
      ).toEqual(["50%", "50%"]);
    });
  });

  describe("PlotAnchor placement", () => {
    beforeEach(() => {
      // jsdom lays nothing out: the content is 100 by 40px.
      vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(40);
    });

    /** An anchor at a pixel point of a 400 by 128px plot, whose scales map values to pixels. */
    const renderAnchor = (at: { x: number; y: number }, props: Partial<PlotAnchorProps>) =>
      act(() =>
        root.render(
          <Plot
            height={128}
            interaction={false}
            overlay={
              <PlotAnchor x={at.x} y={128 - at.y} {...props}>
                Label
              </PlotAnchor>
            }
            table={{ columns: [], rows: [] }}
            title="Anchored"
            x={{ type: "linear", domain: [0, 400] }}
            y={{ type: "linear", domain: [0, 128] }}
          />
        )
      );
    const anchored = () =>
      container.querySelector<HTMLElement>("figure [aria-hidden='true']:not(svg)")?.style;

    // An 8px gap: below or above the anchor for "above" and "below", beside it for "beside".
    it.each<[string, NonNullable<PlotAnchorProps["side"]>, { x: number; y: number }, string]>([
      [
        "above centers over the anchor",
        "above",
        { x: 200, y: 60 },
        "translateX(150px) translateY(12px)"
      ],
      [
        "above stays inside the left edge",
        "above",
        { x: 20, y: 60 },
        "translateX(0px) translateY(12px)"
      ],
      [
        "above flips below near the top",
        "above",
        { x: 200, y: 20 },
        "translateX(150px) translateY(28px)"
      ],
      [
        "below flips above near the bottom",
        "below",
        { x: 200, y: 100 },
        "translateX(150px) translateY(52px)"
      ],
      [
        "beside centers on the anchor's height and flips left near the right edge",
        "beside",
        { x: 380, y: 60 },
        "translateX(272px) translateY(40px)"
      ]
    ])("%s", (_, side, at, transform) => {
      renderAnchor(at, { side, offset: side === "beside" ? { x: 8 } : { y: 8 } });

      expect(anchored()?.transform).toBe(transform);
    });

    it("labels a row of a band y scale by its category, such as each bar of a row chart", () => {
      act(() =>
        root.render(
          <Plot
            height={128}
            interaction={false}
            overlay={
              <PlotAnchor offset={{ x: 8 }} side="beside" x={100} y="Bo">
                12
              </PlotAnchor>
            }
            table={{ columns: [], rows: [] }}
            title="Rows"
            x={{ type: "linear", domain: [0, 400] }}
            y={{ type: "band", domain: ["Ann", "Bo"], paddingInner: 0 }}
          />
        )
      );

      // Bo's band runs from 64 to 128: the 40px label sits 8px after x = 100, centered on 96.
      expect(anchored()?.transform).toBe("translateX(108px) translateY(76px)");
    });

    it("measures its content hidden at the plot's origin, before it places it", () => {
      const measuredAt: string[] = [];
      vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
        this: HTMLElement
      ) {
        measuredAt.push(`${this.style.transform || "none"} ${this.style.visibility || "visible"}`);
        return 100;
      });
      renderAnchor({ x: 380, y: 60 }, { animate: true });

      // A place computed without the size can reach past the plot, and a phone browser that lays
      // the page out with it there widens the page for good.
      expect(measuredAt[0]).toBe("none hidden");
      expect(anchored()?.transform).toMatch(/^translateX/);
      expect(anchored()?.visibility).toBe("");
    });

    it("glides only once its first measured place is on screen", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
      renderAnchor({ x: 380, y: 60 }, { animate: true });
      const box = () =>
        container.querySelector<HTMLElement>("figure [aria-hidden='true']:not(svg)");

      // Measuring paints the first place, so a transition then would sweep in from it.
      expect(box()?.className).not.toContain("transition-transform");
      act(() => {
        vi.advanceTimersByTime(16);
      });
      expect(box()?.className).toContain("transition-transform");
      vi.useRealTimers();
    });

    it("caps the content at maxWidth, so longer text wraps", () => {
      renderAnchor({ x: 200, y: 60 }, { maxWidth: 80 });

      expect(anchored()?.maxWidth).toBe("80px");
    });
  });

  it("paints a legend swatch with its fill and an edge in its color", () => {
    act(() =>
      root.render(
        <PlotLegend
          items={[
            {
              key: "closed",
              label: "Closed",
              color: "chart-2",
              mark: "square",
              fill: { type: "hatch", color: "chart-2", spacing: 3, angle: 45 }
            }
          ]}
        />
      )
    );

    const swatch = container.querySelector<HTMLElement>("li > span");
    expect(swatch?.style.borderColor).toBe("var(--ds-chart-2)");
    expect(swatch?.querySelector("pattern line")?.getAttribute("stroke")).toBe("var(--ds-chart-2)");
    expect(swatch?.querySelector("rect")?.getAttribute("fill")).toMatch(/^url\(#.+\)$/);
  });

  it("paints a tint fill in its slot's tint, which carries ink", () => {
    act(() =>
      root.render(
        <PlotLegend
          items={[
            {
              key: "review",
              label: "Review",
              color: "chart-3",
              mark: "square",
              fill: { type: "tint", color: "chart-3" }
            }
          ]}
        />
      )
    );

    expect(container.querySelector("li > span rect")?.getAttribute("fill")).toBe(
      "var(--ds-background-chart-3)"
    );
  });

  it("paints a gradient through several colors, such as a flow from yellow to teal", () => {
    act(() =>
      root.render(
        <PlotLegend
          items={[
            {
              key: "revenue",
              label: "Revenue",
              color: "chart-2",
              mark: "square",
              fill: {
                type: "gradient",
                direction: "right",
                stops: [
                  { offset: 0, color: "chart-3" },
                  { offset: 0.5, color: "chart-4" },
                  { offset: 1, color: "chart-2", opacity: 0.5 }
                ]
              }
            }
          ]}
        />
      )
    );

    expect(
      Array.from(container.querySelectorAll("li > span linearGradient stop"), (stop) => [
        stop.getAttribute("offset"),
        stop.getAttribute("stop-color"),
        stop.getAttribute("stop-opacity")
      ])
    ).toEqual([
      ["0", "var(--ds-chart-3)", "1"],
      ["0.5", "var(--ds-chart-4)", "1"],
      ["1", "var(--ds-chart-2)", "0.5"]
    ]);
  });

  it("lays a hatch over a tint, so a hatched part keeps its pale base in one fill", () => {
    act(() =>
      root.render(
        <PlotLegend
          items={[
            {
              key: "female",
              label: "Female",
              color: "chart-1",
              mark: "square",
              fill: {
                type: "hatch",
                color: "chart-1",
                spacing: 4,
                angle: 45,
                base: { type: "tint", color: "chart-1" }
              }
            }
          ]}
        />
      )
    );

    expect(
      Array.from(container.querySelector("li > span pattern")?.children ?? [], (part) => [
        part.tagName,
        part.getAttribute("fill") ?? part.getAttribute("stroke")
      ])
    ).toEqual([
      ["rect", "var(--ds-background-chart-1)"],
      ["line", "var(--ds-chart-1)"]
    ]);
  });

  it("pads a track around its bar in the sunken color, so the bar sits in a row", () => {
    act(() =>
      root.render(
        <Plot
          height={120}
          interaction={false}
          table={{ columns: [], rows: [] }}
          title="Rows"
          x={{ type: "linear", domain: [0, 10] }}
          y={{ type: "band", domain: ["a"], paddingInner: 0 }}
        >
          <PlotBars
            data={[5]}
            fill={{ type: "solid", color: "chart-1" }}
            orientation="horizontal"
            size={40}
            track={{ type: "solid", color: "sunken" }}
            trackPad={4}
            x={(value) => value}
            y={() => "a"}
          />
        </Plot>
      )
    );
    const [track, bar] = Array.from(container.querySelectorAll("svg path"));

    // The 40px bar spans y 40 to 80 from x 0; its track spans y 36 to 84 from x -4 to the far
    // edge, with its corners grown by the same 4px.
    expect([track?.getAttribute("d"), track?.getAttribute("fill")]).toEqual([
      "M-4,36H396A4,4 0 0 1 400,40V80A4,4 0 0 1 396,84H-4Z",
      "var(--ds-surface-sunken)"
    ]);
    expect(bar?.getAttribute("d")).toBe("M0,40H200A0,0 0 0 1 200,40V80A0,0 0 0 1 200,80H0Z");
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

    const ringPaths = () =>
      Array.from(container.querySelectorAll('svg path[stroke="var(--ds-text)"]'), (ring) =>
        ring.getAttribute("d")
      );

    it("draws horizontal bars along their rows and picks a row by the pointer's height", () => {
      const regions = ["North", "South", "East"];
      act(() =>
        root.render(
          <Plot
            height={120}
            table={{
              columns: ["Stores"],
              rows: regions.map((region, index) => ({ header: region, cells: [String(index + 4)] }))
            }}
            title="Stores by region"
            x={{ type: "linear", domain: [0, 10] }}
            y={{ type: "band", domain: regions, paddingInner: 0 }}
          >
            <PlotBars
              data={[4, 5, 6]}
              fill={{ type: "solid", color: "chart-1" }}
              orientation="horizontal"
              radius={10}
              x={(value) => value}
              y={(_, index) => regions[index] ?? ""}
            />
          </Plot>
        )
      );

      // Three 40px rows; South runs from 40 to 80px down, its value 5 ends 200px across.
      expect(container.querySelectorAll("svg path")[1]?.getAttribute("d")).toBe(
        "M0,40H190A10,10 0 0 1 200,50V70A10,10 0 0 1 190,80H0Z"
      );
      pointer("pointermove", PLOT_BOX.left + 300, 70);
      expect(slider()?.getAttribute("aria-valuetext")).toBe("South: 5");
      expect(rings()).toBe(1);
    });

    it("stacks bars from their own baselines and rings the column as one", () => {
      const segments = [
        { day: "Mon", from: 0, to: 4 },
        { day: "Mon", from: 4, to: 10 },
        { day: "Tue", from: 0, to: 6 }
      ];
      act(() =>
        root.render(
          <Plot
            height={120}
            table={{
              columns: ["Visits"],
              rows: [
                { header: "Mon", cells: ["10"] },
                { header: "Tue", cells: ["6"] }
              ]
            }}
            title="Visits by source"
            x={{ type: "band", domain: ["Mon", "Tue"], paddingInner: 0 }}
            y={{ type: "linear", domain: [0, 10] }}
          >
            <PlotBars
              data={segments}
              fill={{ type: "solid", color: "chart-1" }}
              x={(segment) => segment.day}
              y={(segment) => segment.to}
              y0={(segment) => segment.from}
            />
          </Plot>
        )
      );

      // Mon runs from 0 to 200px across; 4 sits 72px down and 10 at the top.
      expect(
        Array.from(container.querySelectorAll("svg path"), (bar) => bar.getAttribute("d")).slice(
          0,
          2
        )
      ).toEqual([
        "M0,120V72A0,0 0 0 1 0,72H200A0,0 0 0 1 200,72V120Z",
        "M0,72V0A0,0 0 0 1 0,0H200A0,0 0 0 1 200,0V72Z"
      ]);
      pointer("pointermove", PLOT_BOX.left + 100);
      expect(ringPaths()).toEqual([
        "M-2.5,122.5V0A2.5,2.5 0 0 1 0,-2.5H200A2.5,2.5 0 0 1 202.5,0V122.5Z"
      ]);
    });

    it("picks the part under the pointer by its span, not the nearest middle", () => {
      act(() =>
        root.render(
          <Plot
            height={20}
            interaction={{
              spans: [
                [0, 8],
                [8, 10]
              ]
            }}
            table={{
              columns: ["Tasks"],
              rows: [
                { header: "Done", cells: ["8"] },
                { header: "Left", cells: ["2"] }
              ]
            }}
            title="Progress"
            x={{ type: "linear", domain: [0, 10] }}
          />
        )
      );

      // 300px is 7.5 tasks: inside Done, though Left's middle (9 tasks, 360px) is nearer.
      pointer("pointermove", PLOT_BOX.left + 300, 10);
      expect(slider()?.getAttribute("aria-valuetext")).toBe("Done: 8");
      pointer("pointermove", PLOT_BOX.left + 330, 10);
      expect(slider()?.getAttribute("aria-valuetext")).toBe("Left: 2");
    });

    it('with rest: "none" a pinned bar takes no ring at rest, but a hovered one does', () => {
      act(() =>
        root.render(
          <Plot
            height={120}
            interaction={{ rest: "none" }}
            table={visitsTable}
            title="Visits this week"
            x={{ type: "band", domain: days, paddingInner: 0 }}
            y={{ type: "linear", domain: [0, 25] }}
          >
            <PlotBars
              data={visits}
              fill={{ type: "solid", color: "chart-1" }}
              x={atDay}
              y={(value) => value}
            />
          </Plot>
        )
      );

      pointer("click", wednesday);
      expect(rings()).toBe(1);
      act(() => {
        slider()?.dispatchEvent(
          new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body })
        );
      });

      expect(slider()?.getAttribute("aria-valuetext")).toBe("Wed: 9");
      expect(rings()).toBe(0);
    });

    it('with rest: "highlight" only the plot people used keeps a tooltip for a shared pin', () => {
      function SharedWeek() {
        const [selected, setSelected] = useState<number | null>(null);
        return (
          <>
            {["Visits", "Visits again"].map((title) => (
              <Plot
                key={title}
                height={120}
                interaction={{
                  rest: "highlight",
                  selectedIndex: selected,
                  onSelectedChange: setSelected
                }}
                table={visitsTable}
                title={title}
                x={{ type: "band", domain: days, paddingInner: 0 }}
                y={{ type: "linear", domain: [0, 25] }}
              >
                <PlotBars
                  data={visits}
                  fill={{ type: "solid", color: "chart-1" }}
                  x={atDay}
                  y={(value) => value}
                />
              </Plot>
            ))}
          </>
        );
      }
      act(() => root.render(<SharedWeek />));

      pointer("click", wednesday);
      act(() => {
        slider()?.dispatchEvent(
          new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body })
        );
      });

      const [used, other] = Array.from(container.querySelectorAll('[role="slider"]'), (plot) => ({
        tooltip: plot.querySelector(":scope > div[aria-hidden='true']")?.textContent,
        rings: plot.querySelectorAll('svg path[stroke="var(--ds-text)"]').length
      }));
      expect(used).toEqual({ tooltip: "Wed9", rings: 1 });
      expect(other).toEqual({ tooltip: undefined, rings: 1 });
    });

    it("sets the axis label of the active point in the text color", () => {
      act(() =>
        root.render(
          <Plot
            height={120}
            table={visitsTable}
            title="Visits this week"
            x={{ type: "band", domain: days, paddingInner: 0 }}
            y={{ type: "linear", domain: [0, 25] }}
          >
            <PlotAxis axis="x" format={String} highlight />
          </Plot>
        )
      );

      pointer("pointermove", wednesday);

      expect(
        Array.from(
          container.querySelectorAll('svg text[fill="var(--ds-text)"]'),
          (label) => label.textContent
        )
      ).toEqual(["Wed"]);
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

    /** A custom mark: one dot that tweens to its x with the plot's motion. */
    function CustomDot({ at }: { at: number }) {
      const { x } = usePlot();
      const frame = usePlotTween([x?.position(at) ?? 0]);
      return <circle cx={frame.values[0]} cy={0} r={2} />;
    }
    const dotX = () => Number(container.querySelector("svg circle")?.getAttribute("cx"));

    it("tweens a custom mark with usePlotTween, as the plot's own marks move", () => {
      reducedMotion(false);
      const render = (at: number) =>
        act(() =>
          root.render(
            <Plot
              height={120}
              interaction={false}
              table={{ columns: [], rows: [] }}
              title="Custom"
              x={{ type: "linear", domain: [0, 10] }}
            >
              <CustomDot at={at} />
            </Plot>
          )
        );
      render(0);
      render(10);

      act(() => {
        vi.advanceTimersByTime(64);
      });
      const halfway = dotX();
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(halfway).toBeGreaterThan(0);
      expect(halfway).toBeLessThan(400);
      expect(dotX()).toBe(400);
    });

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

    it("slides each bar to its new place when sorting reorders the data", () => {
      reducedMotion(false);
      const render = (rows: readonly (readonly [string, number])[]) =>
        act(() =>
          root.render(
            <Plot
              height={120}
              interaction={false}
              table={{ columns: [], rows: [] }}
              title="Sorted bars"
              x={{ type: "band", domain: rows.map(([name]) => name), paddingInner: 0 }}
              y={{ type: "linear", domain: [0, 25] }}
            >
              <PlotBars
                data={rows}
                fill={{ type: "solid", color: "chart-1" }}
                x={([name]) => name}
                y={([, value]) => value}
              />
            </Plot>
          )
        );
      render([
        ["a", 10],
        ["b", 20]
      ]);
      render([
        ["b", 20],
        ["a", 10]
      ]);

      act(() => {
        vi.advanceTimersByTime(64);
      });
      // Each path is "M<left>,<base>V<top>…", in data order: b, then a.
      const bars = Array.from(container.querySelectorAll("svg path"), (path) => {
        const [, left, top] = /^M([\d.]+),[\d.]+V([\d.]+)/.exec(path.getAttribute("d") ?? "") ?? [];
        return { left: Number(left), top: Number(top) };
      });

      // b keeps its height (24) and a its height (72) while both move between the two slots.
      expect(bars[0]?.top).toBeCloseTo(24, 6);
      expect(bars[1]?.top).toBeCloseTo(72, 6);
      expect(bars.every((bar) => bar.left > 0 && bar.left < 200)).toBe(true);
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
