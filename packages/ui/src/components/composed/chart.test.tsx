// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BarChart,
  DonutChart,
  LineChart,
  RadialProgress,
  seriesColor,
  type BarChartProps,
  type ChartAnnotation,
  type ChartColor,
  type LineChartProps
} from "./chart";

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

/** Renders a chart with its Recharts plot drawn. */
async function renderPlot(chart: ReactElement) {
  // With reduced motion, Recharts draws every mark at once, not after animating.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  }));
  act(() => root.render(chart));
  await act(() => import("./chart.recharts"));
}

const fillsOf = (selector: string) =>
  Array.from(container.querySelectorAll(selector), (element) => element.getAttribute("fill"));

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
    ],
    [
      // The caption of a pinned annotation follows its value, so the table names that point.
      "LineChart",
      <LineChart
        key="line"
        title="Tokens per day"
        data={[
          { day: "Wed", tokens: 7400 },
          { day: "Thu", tokens: 18500 }
        ]}
        index="day"
        series={[{ key: "tokens", label: "Tokens" }]}
        annotation={{ at: "Thu", label: "Peak" }}
        valueFormatter={users}
      />,
      "Tokens per day",
      [
        ["", "Tokens"],
        ["Wed", "7400 users"],
        ["Thu", "18500 users (Peak)"]
      ]
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

describe("LineChart marks", () => {
  const week = [
    { day: "Wed", now: 7400, last: 9500 },
    { day: "Thu", now: 18500, last: 9000 },
    { day: "Fri", now: 16000, last: 8800 }
  ];
  const line = (props: Partial<LineChartProps>) => (
    <LineChart
      title="Tokens per day"
      data={week}
      index="day"
      series={[
        { key: "now", label: "This week" },
        { key: "last", label: "Last week" }
      ]}
      valueFormatter={users}
      hideGrid
      hideXAxis
      hideYAxis
      {...props}
    />
  );

  it.each<[LineChartProps["dots"], number]>([
    [undefined, 0],
    ["last", 2],
    ["all", 6]
  ])("dots=%s draws %i dots on two series of three points", async (dots, count) => {
    await renderPlot(line(dots === undefined ? {} : { dots }));

    expect(container.querySelectorAll("svg circle")).toHaveLength(count);
  });

  it.each<[ChartAnnotation, string[]]>([
    [{ at: "Thu", label: "Peak" }, ["Peak", "18500 users"]],
    [{ at: "Wed", series: "last" }, ["9500 users"]]
  ])("annotation %j stays visible over the plot as %j", async (annotation, text) => {
    await renderPlot(line({ annotation }));

    expect(
      Array.from(container.querySelectorAll("svg foreignObject span"), (span) => span.textContent)
    ).toEqual(text);
  });

  it('area="gradient" fades each chart\'s own series color to transparent', async () => {
    await renderPlot(
      <>
        {line({ area: "gradient", series: [{ key: "now", label: "This week" }] })}
        {line({ area: "gradient", series: [{ key: "now", label: "This week", color: "chart-3" }] })}
      </>
    );

    // Each area points at a gradient by id; two charts must not share one.
    const gradients = fillsOf("svg path[fill^='url(#']").map((fill) => {
      const stops = document.getElementById(fill?.slice(5, -1) ?? "")?.querySelectorAll("stop");
      return [stops?.[0]?.getAttribute("stop-color"), stops?.[1]?.getAttribute("stop-opacity")];
    });
    expect(gradients).toEqual([
      ["var(--ds-chart-1)", "0"],
      ["var(--ds-chart-3)", "0"]
    ]);
  });
});

describe("BarChart bar colors", () => {
  it.each<[string, Partial<BarChartProps>, Array<string | null>]>([
    [
      "a highlight mutes the other bars",
      { highlight: "Feb" },
      ["var(--ds-border-bold)", "var(--ds-chart-1)", "var(--ds-border-bold)"]
    ],
    [
      "a highlight color keeps the other bars in the series color",
      { highlight: "Feb", highlightColor: "chart-2" },
      ["var(--ds-chart-1)", "var(--ds-chart-2)", "var(--ds-chart-1)"]
    ],
    [
      "a track draws a quiet slot behind each bar",
      { track: true },
      [
        "var(--ds-chart-grid)",
        "var(--ds-chart-grid)",
        "var(--ds-chart-grid)",
        "var(--ds-chart-1)",
        "var(--ds-chart-1)",
        "var(--ds-chart-1)"
      ]
    ]
  ])("%s", async (_, props, fills) => {
    await renderPlot(
      <BarChart
        title="Visits by month"
        data={[
          { month: "Jan", visits: 120 },
          { month: "Feb", visits: 310 },
          { month: "Mar", visits: 180 }
        ]}
        index="month"
        series={[{ key: "visits", label: "Visits" }]}
        hideGrid
        hideXAxis
        hideYAxis
        {...props}
      />
    );

    expect(fillsOf("svg path")).toEqual(fills);
  });
});

describe("RadialProgress color", () => {
  it.each<[ChartColor | undefined, string]>([
    [undefined, "var(--ds-chart-1)"],
    ["success", "var(--ds-border-success)"]
  ])("color=%s draws the ring in %s over the track", async (color, fill) => {
    await renderPlot(
      <RadialProgress title="Storage" value={18} max={24} {...(color ? { color } : {})} />
    );

    expect(fillsOf("svg path")).toEqual(["var(--ds-chart-grid)", fill]);
  });
});
