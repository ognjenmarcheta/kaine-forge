import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it("applies compound variant classes for appearance and emphasis", () => {
    const markup = renderToStaticMarkup(
      <Badge appearance="success" emphasis="bold">
        Active
      </Badge>
    );
    expect(markup).toContain("bg-[var(--ds-background-success-bold)]");
    expect(markup).toContain("text-[color:var(--ds-text-inverse)]");
  });

  it("merges custom className", () => {
    const markup = renderToStaticMarkup(<Badge className="custom-badge">Default</Badge>);
    expect(markup).toContain("custom-badge");
    expect(markup).toContain("bg-[var(--ds-background-neutral)]");
  });
});
