import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProgressBar } from "./progress-bar";

describe("ProgressBar", () => {
  it("renders ARIA progressbar attributes", () => {
    const markup = renderToStaticMarkup(<ProgressBar value={42} />);
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="42"');
    expect(markup).toContain('aria-valuemin="0"');
    expect(markup).toContain('aria-valuemax="100"');
  });

  it("renders label text and percentage", () => {
    const markup = renderToStaticMarkup(<ProgressBar value={75} label="Progress" />);
    expect(markup).toContain("Progress");
    expect(markup).toContain("75%");
  });

  it("applies appearance variant", () => {
    const markup = renderToStaticMarkup(<ProgressBar value={50} appearance="success" />);
    expect(markup).toContain("bg-[var(--ds-background-success-bold)]");
  });
});
