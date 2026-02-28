import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Tag } from "./tag";

describe("Tag", () => {
  it("applies appearance variant classes", () => {
    const markup = renderToStaticMarkup(<Tag appearance="danger">Error</Tag>);
    expect(markup).toContain("bg-[var(--ds-background-danger)]");
    expect(markup).toContain("text-[color:var(--ds-text-danger)]");
  });

  it("renders remove button with aria-label when onRemove is provided", () => {
    const markup = renderToStaticMarkup(
      <Tag onRemove={() => {}} removeLabel="Remove tag">
        Removable
      </Tag>
    );
    expect(markup).toContain('aria-label="Remove tag"');
    expect(markup).toContain("<button");
  });
});
