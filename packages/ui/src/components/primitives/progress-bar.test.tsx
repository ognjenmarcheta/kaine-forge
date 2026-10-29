// @vitest-environment jsdom
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProgressBar, type ProgressBarPart } from "./progress-bar";

/** The progressbar element of a bar rendered to markup. */
function render(element: ReactElement) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(element);
  return container.querySelector<HTMLElement>('[role="progressbar"]');
}

describe("ProgressBar", () => {
  it("renders ARIA progressbar attributes", () => {
    const markup = renderToStaticMarkup(<ProgressBar value={42} />);
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="42"');
    expect(markup).toContain('aria-valuemin="0"');
    expect(markup).toContain('aria-valuemax="100"');
  });

  it("renders label text and percentage", () => {
    const markup = renderToStaticMarkup(<ProgressBar value={75} label="Progress" />);
    expect(markup).toContain("Progress");
    expect(markup).toContain("75%");
  });

  it("applies appearance variant", () => {
    const markup = renderToStaticMarkup(<ProgressBar value={50} appearance="success" />);
    expect(markup).toContain("bg-ds-bg-success-bold");
  });

  it("takes a thickness in pixels", () => {
    const markup = renderToStaticMarkup(<ProgressBar height={48} value={50} />);
    expect(markup).toContain('style="height:48px"');
  });

  it.each<[string, ProgressBarPart[], string[]]>([
    [
      "leave the rest of max to the track",
      [
        { key: "design", value: 20, appearance: "chart-1" },
        { key: "build", value: 30, appearance: "chart-2" }
      ],
      ["20", "30", "50"]
    ],
    [
      "stop where the bar is full",
      [
        { key: "design", value: 60, appearance: "chart-1" },
        { key: "build", value: 70, appearance: "chart-2" }
      ],
      ["60", "40"]
    ]
  ])("lays several fills end to end, which %s", (_, parts, grows) => {
    const bar = render(<ProgressBar parts={parts} />);

    expect(
      Array.from(
        bar?.querySelectorAll<HTMLElement>(":scope > div") ?? [],
        (piece) => piece.style.flexGrow
      )
    ).toEqual(grows);
  });

  it("reports the total of its fills", () => {
    const bar = render(
      <ProgressBar
        parts={[
          { key: "design", value: 20, appearance: "chart-1" },
          { key: "build", value: 30, appearance: "chart-2" }
        ]}
      />
    );

    expect(bar?.getAttribute("aria-valuenow")).toBe("50");
  });

  it.each<[string, ReactElement, boolean, boolean]>([
    [
      "on the track behind a sliding fill",
      <ProgressBar key="slide" track="hatch" value={80} />,
      true,
      false
    ],
    [
      "on the rest, apart from the fill",
      <ProgressBar key="gap" gap track="hatch" value={80} />,
      false,
      true
    ]
  ])("draws the track look %s", (_, element, onTrack, onRest) => {
    const bar = render(element);

    expect(bar?.classList.contains("bg-hatch")).toBe(onTrack);
    expect(bar?.lastElementChild?.classList.contains("bg-hatch")).toBe(onRest);
  });
});
