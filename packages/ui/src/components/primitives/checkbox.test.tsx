import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("renders shadcn slots and checked state attributes", () => {
    const markup = renderToStaticMarkup(
      <Checkbox aria-label="Mark completed" checked className="custom-class" />
    );

    expect(markup).toContain('data-slot="checkbox"');
    expect(markup).toContain('data-slot="checkbox-indicator"');
    expect(markup).toContain("peer border-[var(--ds-border)]");
    expect(markup).toContain("custom-class");
    expect(markup).toContain('aria-label="Mark completed"');
    expect(markup).toContain('data-state="checked"');
  });
});
