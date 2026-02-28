import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";

describe("Collapsible", () => {
  it("renders collapsible structure", () => {
    const markup = renderToStaticMarkup(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Hidden content</CollapsibleContent>
      </Collapsible>
    );
    expect(markup).toContain("Toggle");
  });
});
