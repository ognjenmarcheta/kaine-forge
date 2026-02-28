import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RadioGroup, RadioGroupItem } from "./radio";

describe("RadioGroup", () => {
  it("renders radio item with border token classes", () => {
    const markup = renderToStaticMarkup(
      <RadioGroup>
        <RadioGroupItem value="a" />
      </RadioGroup>
    );
    expect(markup).toContain("border-[var(--ds-border)]");
    expect(markup).toContain("rounded-[var(--ds-radius-round)]");
  });
});
