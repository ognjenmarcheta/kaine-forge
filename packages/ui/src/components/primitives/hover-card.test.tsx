import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HoverCard, HoverCardTrigger } from "./hover-card";

describe("HoverCard", () => {
  it("renders trigger content", () => {
    const markup = renderToStaticMarkup(
      <HoverCard>
        <HoverCardTrigger>Hover target</HoverCardTrigger>
      </HoverCard>
    );
    expect(markup).toContain("Hover target");
  });
});
