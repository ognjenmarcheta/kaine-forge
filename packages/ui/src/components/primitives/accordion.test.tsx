import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";

describe("Accordion", () => {
  it("renders item with border token classes", () => {
    const markup = renderToStaticMarkup(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Section 1</AccordionTrigger>
          <AccordionContent>Content 1</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
    expect(markup).toContain("border-b");
    expect(markup).toContain("border-[var(--ds-border)]");
    expect(markup).toContain("Section 1");
  });
});
