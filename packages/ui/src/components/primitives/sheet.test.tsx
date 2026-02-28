import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SheetFooter, SheetHeader } from "./sheet";

describe("Sheet", () => {
  it("renders header with data-slot and layout classes", () => {
    const markup = renderToStaticMarkup(
      <SheetHeader className="custom-header">Header content</SheetHeader>
    );
    expect(markup).toContain('data-slot="sheet-header"');
    expect(markup).toContain("custom-header");
    expect(markup).toContain("Header content");
  });

  it("renders footer with data-slot", () => {
    const markup = renderToStaticMarkup(<SheetFooter>Footer content</SheetFooter>);
    expect(markup).toContain('data-slot="sheet-footer"');
    expect(markup).toContain("Footer content");
  });
});
