import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Tooltip, TooltipProvider, TooltipTrigger } from "./tooltip";

describe("Tooltip", () => {
  it("renders trigger with data-slot", () => {
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
        </Tooltip>
      </TooltipProvider>
    );
    expect(markup).toContain("Hover me");
  });
});
