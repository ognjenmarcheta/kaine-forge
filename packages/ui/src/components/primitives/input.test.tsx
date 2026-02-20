import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Input } from "./input";

describe("Input", () => {
  it("is implemented as a forwardRef component", () => {
    expect((Input as unknown as { $$typeof?: symbol }).$$typeof).toBe(
      Symbol.for("react.forward_ref")
    );
  });

  it("renders with the base class and forwards native props", () => {
    const markup = renderToStaticMarkup(
      <Input className="custom-class" placeholder="Todo title" required type="text" />
    );

    expect(markup).toContain("<input");
    expect(markup).toContain("ui-input");
    expect(markup).toContain("custom-class");
    expect(markup).toContain('placeholder="Todo title"');
    expect(markup).toContain('type="text"');
    expect(markup).toContain("required");
  });
});
