import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Separator } from "./separator";

describe("Separator", () => {
  it("renders with data-slot and default horizontal orientation", () => {
    const markup = renderToStaticMarkup(<Separator />);
    expect(markup).toContain('data-slot="separator"');
    expect(markup).toContain('data-orientation="horizontal"');
  });

  it("merges custom className", () => {
    const markup = renderToStaticMarkup(<Separator className="my-4" />);
    expect(markup).toContain("my-4");
  });
});
