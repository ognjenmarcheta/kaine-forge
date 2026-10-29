// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProportionBar } from "./proportion-bar";

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
});

const wards = [
  { key: "icu", label: "ICU", value: 82 },
  { key: "surgery", label: "Surgery", value: 28 },
  { key: "general", label: "General", value: 0 }
];
const beds = (value: number) => `${value} beds`;
const slider = () => container.querySelector<HTMLElement>('[role="slider"]');
const press = (key: string) =>
  act(() => {
    slider()?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });

/** Lays the bar's parts out as a 112px bar would: ICU from 0 to 82px, Surgery from 84px. */
function layOutParts() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    const position = Array.from(this.parentElement?.children ?? []).indexOf(this);
    if (this.tagName !== "SPAN") return new DOMRect(0, 0, 112, 8);
    return position === 0 ? new DOMRect(0, 0, 82, 8) : new DOMRect(84, 0, 28, 8);
  });
}

describe("ProportionBar", () => {
  // The bar is a picture: the name and every part's value reach screen readers as text whether
  // the legend shows them or not, including a part too small to draw (A11Y-7, COLOR-2).
  it.each([false, true])("names the bar and lists each part as text (legend: %s)", (legend) => {
    act(() =>
      root.render(
        <ProportionBar
          label="Beds by ward"
          legend={legend}
          segments={[
            { key: "icu", label: "ICU", value: 82 },
            { key: "surgery", label: "Surgery", value: 28 },
            { key: "general", label: "General", value: 0 }
          ]}
          valueFormatter={(value) => `${value} beds`}
        />
      )
    );

    expect(container.querySelector("figure")?.getAttribute("aria-label")).toBe("Beds by ward");
    expect(
      Array.from(container.querySelectorAll("dt"), (term) => [
        term.textContent,
        term.nextElementSibling?.textContent
      ])
    ).toEqual([
      ["ICU", "82 beds"],
      ["Surgery", "28 beds"],
      ["General", "0 beds"]
    ]);
  });

  // DATA-5: the keyboard reaches every part that has width, and the slider says it in words.
  it("walks the drawn parts with the keys and says each one's name and value", () => {
    act(() =>
      root.render(<ProportionBar label="Beds by ward" segments={wards} valueFormatter={beds} />)
    );

    act(() => slider()?.focus());
    const said = [slider()?.getAttribute("aria-valuetext")];
    press("ArrowRight");
    said.push(slider()?.getAttribute("aria-valuetext"));
    // General has no width, so Surgery is the last stop.
    press("ArrowRight");
    said.push(slider()?.getAttribute("aria-valuetext"));

    expect(slider()?.getAttribute("aria-valuemax")).toBe("2");
    expect(said).toEqual(["ICU: 82 beds", "Surgery: 28 beds", "Surgery: 28 beds"]);
  });

  it("picks the part under the pointer, keeps a clicked part after the pointer leaves, and lets Escape go", () => {
    layOutParts();
    const onActiveChange = vi.fn();
    act(() =>
      root.render(
        <ProportionBar label="Beds by ward" segments={wards} onActiveChange={onActiveChange} />
      )
    );

    act(() => {
      slider()?.dispatchEvent(new MouseEvent("pointermove", { clientX: 100, bubbles: true }));
      slider()?.dispatchEvent(new MouseEvent("click", { clientX: 100, bubbles: true }));
      slider()?.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));
    });
    press("Escape");

    expect(onActiveChange.mock.calls).toEqual([[1], [null]]);
  });

  it.each<[boolean | undefined, number]>([
    [undefined, 1],
    [false, 0]
  ])(
    "answers the pointer and the keys unless interaction is false (%s)",
    (interaction, sliders) => {
      act(() =>
        root.render(
          <ProportionBar
            label="Beds by ward"
            segments={wards}
            {...(interaction === undefined ? {} : { interaction })}
          />
        )
      );

      expect(container.querySelectorAll('[role="slider"]')).toHaveLength(sliders);
    }
  );

  it.each<[boolean | undefined, string | null]>([
    [undefined, "Surgery28 beds"],
    [false, null]
  ])("shows the active part in a tooltip unless it is false (%s)", (tooltip, text) => {
    layOutParts();
    act(() =>
      root.render(
        <ProportionBar
          label="Beds by ward"
          segments={wards}
          valueFormatter={beds}
          {...(tooltip === undefined ? {} : { tooltip })}
        />
      )
    );

    act(() => {
      slider()?.dispatchEvent(new MouseEvent("pointermove", { clientX: 100, bubbles: true }));
    });

    expect(
      slider()?.querySelector(":scope > div[aria-hidden='true'] ~ div")?.textContent ?? null
    ).toBe(text);
  });

  // COLOR-2: a hatched part differs from its solid neighbors by pattern as well as color.
  it("draws a hatched part as lines of its color, in the bar and in its swatch", () => {
    act(() =>
      root.render(
        <ProportionBar
          label="Activities"
          legend
          segments={[
            { key: "done", label: "Done", value: 8, color: "chart-2" },
            { key: "left", label: "Left", value: 2, color: "chart-3", fill: "hatch" }
          ]}
        />
      )
    );

    // The part in the bar, then its swatch in the legend, each with lines in chart-3.
    expect(
      Array.from(container.querySelectorAll(".bg-hatch"), (part) =>
        part.classList.contains("text-ds-chart-3")
      )
    ).toEqual([true, true]);
  });

  it("takes a thickness in pixels", () => {
    act(() =>
      root.render(<ProportionBar height={6} interaction={false} label="Beds" segments={wards} />)
    );

    expect(container.querySelector<HTMLElement>("figure > div")?.style.height).toBe("6px");
  });
});
