import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppLayout } from "./app-layout";

describe("app-layout", () => {
  it("renders a full-width app shell container", () => {
    const markup = renderToStaticMarkup(
      <AppLayout
        header={<header>Header</header>}
        main={<main>Main</main>}
        sidebar={<aside>Sidebar</aside>}
      />
    );

    expect(markup).toContain("ui-app-shell");
    expect(markup).toContain("w-full");
    expect(markup).toContain("flex-1");
    expect(markup).toContain("min-w-0");
  });
});
