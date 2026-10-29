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

  it.each([
    [undefined, "ui-page-header__description"],
    ["small", "ui-page-header__description text-body-sm"],
    ["large", "ui-page-header__description text-body-lg"]
  ] as const)("sets a %s description in its type step (TYPE-1)", (descriptionSize, classes) => {
    const markup = renderToStaticMarkup(
      <PageHeader
        description="Track work"
        title="Todos"
        {...(descriptionSize ? { descriptionSize } : {})}
      />
    );

    expect(markup).toContain(`<p class="${classes}">Track work</p>`);
  });
});
