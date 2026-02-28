import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Spinner } from "./spinner";

describe("Spinner", () => {
  it("renders with role and default aria-label", () => {
    const markup = renderToStaticMarkup(<Spinner />);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="Loading"');
    expect(markup).toContain("h-6 w-6");
  });

  it("applies size variant classes", () => {
    const markup = renderToStaticMarkup(<Spinner size="lg" label="Processing" />);
    expect(markup).toContain("h-8 w-8");
    expect(markup).toContain('aria-label="Processing"');
  });
});
