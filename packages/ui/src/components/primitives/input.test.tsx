import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Input } from "./input";

describe("Input", () => {
  it("renders shadcn data-slot and utility classes with native props", () => {
    const markup = renderToStaticMarkup(
      <Input className="custom-class" placeholder="Todo title" required type="text" />
    );

    expect(markup).toContain("<input");
    expect(markup).toContain('data-slot="input"');
    expect(markup).toContain("border-input");
    expect(markup).toContain("focus-visible:ring-[3px]");
    expect(markup).toContain("custom-class");
    expect(markup).toContain('placeholder="Todo title"');
    expect(markup).toContain('type="text"');
    expect(markup).toContain("required");
  });
});
