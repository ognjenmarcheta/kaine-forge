import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarChart } from "./bar-chart";
import { DonutChart } from "./donut-chart";

describe("mobile charts", () => {
  it("expose the donut as one named image with its center figure", () => {
    render(
      <DonutChart
        accessibilityLabel="293 cases: hypertension 40%, pneumonia 32%, diabetes 27%"
        centerLabel="Cases"
        centerValue="293"
        segments={[
          { label: "Hypertension", value: 40 },
          { label: "Pneumonia", value: 32 },
          { label: "Diabetes", value: 27 }
        ]}
      />
    );

    expect(
      screen.getByRole("img", {
        name: "293 cases: hypertension 40%, pneumonia 32%, diabetes 27%"
      }).textContent
    ).toContain("293");
  });

  it("expose the bar chart as one named image with its category labels", () => {
    render(
      <BarChart
        accessibilityLabel="Patients by month"
        data={[
          { month: "Feb", inpatient: 2100, outpatient: 2800 },
          { month: "Mar", inpatient: 1500, outpatient: 2000 }
        ]}
        index="month"
        series={[
          { key: "inpatient", label: "Inpatient" },
          { key: "outpatient", label: "Outpatient" }
        ]}
      />
    );

    expect(screen.getByRole("img", { name: "Patients by month" }).textContent).toBe("FebMar");
  });
});
