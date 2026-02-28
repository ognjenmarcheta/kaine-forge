import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

describe("Tabs", () => {
  it("renders tab list with border classes", () => {
    const markup = renderToStaticMarkup(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
      </Tabs>
    );
    expect(markup).toContain("border-b");
    expect(markup).toContain("border-[var(--ds-border)]");
    expect(markup).toContain("Tab 1");
  });
});
