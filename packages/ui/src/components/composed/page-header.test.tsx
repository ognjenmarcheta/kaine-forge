import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  // e2e specs locate every page by `.ui-app-shell h1`, so the title must stay the page's h1.
  it("renders the title as the page h1", () => {
    const markup = renderToStaticMarkup(
      <PageHeader eyebrow="Acme" title="Todos" description="Track work" />
    );

    expect(markup).toContain("<h1>Todos</h1>");
  });
});
