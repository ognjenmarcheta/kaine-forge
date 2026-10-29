import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Card, CardHeader, CardIcon, CardTitle } from "./card";

describe("Card", () => {
  it("merges class names for root and sections", () => {
    const markup = renderToStaticMarkup(
      <Card className="custom-card">
        <CardHeader className="custom-header">
          <CardTitle className="custom-title">Delivery</CardTitle>
        </CardHeader>
      </Card>
    );

    expect(markup).toContain("custom-card");
    expect(markup).toContain("custom-header");
    expect(markup).toContain("custom-title");
  });

  it.each([
    [undefined, "h3"],
    ["h2", "h2"],
    ["h4", "h4"]
  ] as const)("renders the title as=%s at heading level %s", (as, heading) => {
    const markup = renderToStaticMarkup(<CardTitle {...(as ? { as } : {})}>Visits</CardTitle>);

    expect(markup).toMatch(new RegExp(`^<${heading}[^>]*>Visits</${heading}>$`));
  });

  it("hides the header icon from screen readers, so the title alone names the card", () => {
    const markup = renderToStaticMarkup(
      <CardHeader>
        <CardIcon>
          <svg />
        </CardIcon>
        <CardTitle>Vaccinations</CardTitle>
      </CardHeader>
    );

    expect(markup).toMatch(/^<div[^>]*><span aria-hidden="true" data-slot="card-icon"[^>]*><svg>/);
  });
});
