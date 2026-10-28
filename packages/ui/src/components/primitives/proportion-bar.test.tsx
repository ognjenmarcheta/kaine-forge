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
});

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
});
