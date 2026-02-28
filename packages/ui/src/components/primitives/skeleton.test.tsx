import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("renders with data-slot and animation class", () => {
    const markup = renderToStaticMarkup(<Skeleton />);
    expect(markup).toContain('data-slot="skeleton"');
    expect(markup).toContain("animate-pulse");
  });

  it("merges custom className", () => {
    const markup = renderToStaticMarkup(<Skeleton className="h-12 w-full" />);
    expect(markup).toContain("h-12 w-full");
    expect(markup).toContain("animate-pulse");
  });
});
