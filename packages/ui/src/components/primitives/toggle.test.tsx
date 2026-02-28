import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Toggle } from "./toggle";

describe("Toggle", () => {
  it("renders with design token classes for checked and unchecked states", () => {
    const markup = renderToStaticMarkup(<Toggle />);
    expect(markup).toContain("data-[state=checked]:bg-[var(--ds-background-brand-bold)]");
    expect(markup).toContain("data-[state=unchecked]:bg-[var(--ds-background-neutral-bold)]");
  });
});
