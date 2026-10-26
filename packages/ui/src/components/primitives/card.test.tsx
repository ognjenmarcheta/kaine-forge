import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Card, CardHeader, CardTitle } from "./card";

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
});
