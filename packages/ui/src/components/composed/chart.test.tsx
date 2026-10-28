// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BarChart, DonutChart, RadialProgress, seriesColor, type ChartColor } from "./chart";

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
});

const users = (value: number) => `${value} users`;

describe("charts", () => {
  // The render is synchronous, so the lazy Recharts module cannot have loaded yet: the figure
  // name and the data table must not depend on it.
  it.each<[string, ReactElement, string, Array<Array<string | null>>]>([
    [
      "BarChart",
      <BarChart
        key="bar"
        title="Signups by month"
        data={[
          { month: "Jan", web: 120, mobile: 80 },
          { month: "Feb", web: 150, mobile: 95 }
        ]}
        index="month"
        series={[
          { key: "web", label: "Web" },
          { key: "mobile", label: "Mobile" }
        ]}
        valueFormatter={users}
      />,
      "Signups by month",
      [
        ["", "Web", "Mobile"],
        ["Jan", "120 users", "80 users"],
        ["Feb", "150 users", "95 users"]
      ]
    ],
    [
      "DonutChart",
      <DonutChart
        key="donut"
        title="Traffic sources"
        hideTitle
        data={[
          { source: "Direct", visits: 300 },
          { source: "Search", visits: 200 }
        ]}
        index="source"
        series={{ key: "visits", label: "Visits" }}
        valueFormatter={users}
      />,
      "Traffic sources",
      [
        ["", "Visits"],
        ["Direct", "300 users"],
        ["Search", "200 users"]
      ]
    ],
    [
      "RadialProgress",
      <RadialProgress key="radial" title="Storage" label="Used" value={18} max={24} />,
      "Storage",
      [["Storage", "75%", "Used"]]
    ]
  ])(
    "%s names its figure and lists its data in a table before Recharts loads",
    (_, chart, name, rows) => {
      act(() => root.render(chart));

      const titleId = container.querySelector("figure")?.getAttribute("aria-labelledby") ?? "";
      expect(document.getElementById(titleId)?.textContent).toBe(name);
      expect(
        Array.from(container.querySelectorAll("table tr"), (row) =>
          Array.from(row.querySelectorAll("th, td"), (cell) => cell.textContent)
        )
      ).toEqual(rows);
    }
  );
});

describe("seriesColor", () => {
  // Color follows the series, not its rank: an own color wins over the position, and the six
  // slots never cycle, so a seventh series without a color takes the neutral.
  it.each<[number, ChartColor | undefined, { color: string; swatch: string }]>([
    [0, undefined, { color: "var(--ds-chart-1)", swatch: "bg-ds-chart-1" }],
    [0, "chart-5", { color: "var(--ds-chart-5)", swatch: "bg-ds-chart-5" }],
    [3, "success", { color: "var(--ds-border-success)", swatch: "bg-ds-border-success" }],
    [6, undefined, { color: "var(--ds-border-bold)", swatch: "bg-ds-border-bold" }]
  ])("paints position %i with color %s", (position, color, paint) => {
    expect(seriesColor(position, color)).toEqual(paint);
  });
});

describe("BarChart value labels", () => {
  const visits = [
    { month: "Jan", visits: 120 },
    { month: "Feb", visits: 310 },
    { month: "Mar", visits: 180 }
  ];

  it.each<["all" | "highlight", string[]]>([
    ["highlight", ["310 users"]],
    ["all", ["120 users", "310 users", "180 users"]]
  ])('valueLabels="%s" prints the formatted values of those bars', async (valueLabels, labels) => {
    // With reduced motion, Recharts draws the bars and their labels at once, not after animating.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }));
    act(() =>
      root.render(
        <BarChart
          title="Visits by month"
          data={visits}
          index="month"
          series={[{ key: "visits", label: "Visits" }]}
          highlight="Feb"
          valueLabels={valueLabels}
          valueFormatter={users}
          hideXAxis
          hideYAxis
        />
      )
    );
    await act(() => import("./chart.recharts"));

    // The axes are hidden, so the value labels are the only text in the plot.
    expect(Array.from(container.querySelectorAll("svg text"), (text) => text.textContent)).toEqual(
      labels
    );
  });
});
