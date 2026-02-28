import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Breadcrumbs } from "./breadcrumbs";

describe("breadcrumbs", () => {
  it("uses consumer-provided aria label", () => {
    const markup = renderToStaticMarkup(
      <Breadcrumbs
        ariaLabel="Navigation trail"
        items={[{ href: "/dashboard", label: "Kaine" }, { label: "Todos" }]}
      />
    );

    expect(markup).toContain('aria-label="Navigation trail"');
    expect(markup).not.toContain('aria-label="Breadcrumb"');
  });
});
