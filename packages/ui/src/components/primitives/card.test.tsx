import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";

describe("Card", () => {
  it("renders composed structure with slot metadata", () => {
    const markup = renderToStaticMarkup(
      <Card>
        <CardHeader>
          <CardTitle>Workload</CardTitle>
          <CardDescription>Visibility into current execution load.</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );

    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain('data-slot="card-header"');
    expect(markup).toContain('data-slot="card-title"');
    expect(markup).toContain('data-slot="card-description"');
    expect(markup).toContain('data-slot="card-content"');
    expect(markup).toContain('data-slot="card-footer"');
  });

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
