import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Slider } from "./slider";

describe("Slider", () => {
  it("renders with design token classes", () => {
    const markup = renderToStaticMarkup(<Slider defaultValue={[50]} />);
    expect(markup).toContain("bg-[var(--ds-background-neutral)]");
    expect(markup).toContain("bg-[var(--ds-background-brand-bold)]");
  });
});
