import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("renders with ui-textarea class", () => {
    const markup = renderToStaticMarkup(<Textarea placeholder="Enter text" />);
    expect(markup).toContain("<textarea");
    expect(markup).toContain("ui-textarea");
    expect(markup).toContain('placeholder="Enter text"');
  });

  it("merges custom className", () => {
    const markup = renderToStaticMarkup(<Textarea className="custom-textarea" />);
    expect(markup).toContain("custom-textarea");
    expect(markup).toContain("ui-textarea");
  });
});
