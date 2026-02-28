import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Label } from "./label";

describe("Label", () => {
  it("renders with data-slot attribute", () => {
    const markup = renderToStaticMarkup(<Label>Email</Label>);
    expect(markup).toContain('data-slot="label"');
    expect(markup).toContain("Email");
  });

  it("merges custom className", () => {
    const markup = renderToStaticMarkup(<Label className="custom-label">Name</Label>);
    expect(markup).toContain("custom-label");
  });
});
