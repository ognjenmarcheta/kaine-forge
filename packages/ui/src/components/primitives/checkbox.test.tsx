import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("is implemented as a forwardRef component", () => {
    expect((Checkbox as unknown as { $$typeof?: symbol }).$$typeof).toBe(
      Symbol.for("react.forward_ref")
    );
  });

  it("renders with base class and checked state attributes", () => {
    const markup = renderToStaticMarkup(
      <Checkbox aria-label="Mark completed" checked className="custom-class" />
    );

    expect(markup).toContain("ui-checkbox");
    expect(markup).toContain("custom-class");
    expect(markup).toContain('aria-label="Mark completed"');
    expect(markup).toContain('data-state="checked"');
  });
});
