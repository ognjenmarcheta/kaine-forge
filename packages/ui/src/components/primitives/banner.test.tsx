import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Banner } from "./banner";

describe("Banner", () => {
  it("renders with role alert and appearance variant", () => {
    const markup = renderToStaticMarkup(<Banner appearance="error">System down</Banner>);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("bg-[var(--ds-background-danger-bold)]");
  });

  it("renders dismiss button with aria-label when onDismiss is provided", () => {
    const markup = renderToStaticMarkup(
      <Banner onDismiss={() => {}} dismissLabel="Close banner">
        Info
      </Banner>
    );
    expect(markup).toContain('aria-label="Close banner"');
    expect(markup).toContain("<button");
  });

  it("renders icon when provided", () => {
    const markup = renderToStaticMarkup(
      <Banner icon={<span data-testid="icon" />}>With icon</Banner>
    );
    expect(markup).toContain('data-testid="icon"');
  });
});
