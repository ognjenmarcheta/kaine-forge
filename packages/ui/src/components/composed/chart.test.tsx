// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BarChart, DonutChart, RadialProgress } from "./chart";

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
