import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScrollArea } from "./scroll-area";

describe("ScrollArea", () => {
  it("renders with overflow-hidden class", () => {
    const markup = renderToStaticMarkup(<ScrollArea>Content</ScrollArea>);
    expect(markup).toContain("overflow-hidden");
    expect(markup).toContain("Content");
  });
});
