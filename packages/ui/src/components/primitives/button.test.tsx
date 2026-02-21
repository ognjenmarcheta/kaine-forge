import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("applies variant classes and forwards props", () => {
    const markup = renderToStaticMarkup(
      <Button appearance="danger" className="custom-class" spacing="spacious" type="button">
        Delete
      </Button>
    );

    expect(markup).toContain("<button");
    expect(markup).toContain('type="button"');
    expect(markup).toContain("ui-button");
    expect(markup).toContain("ui-button--danger");
    expect(markup).toContain("ui-button--lg");
    expect(markup).toContain("custom-class");
  });

  it("renders child element instead of native button when asChild is true", () => {
    const markup = renderToStaticMarkup(
      <Button asChild appearance="subtle">
        <a href="/settings">Settings</a>
      </Button>
    );

    expect(markup).toContain("<a");
    expect(markup).toContain('href="/settings"');
    expect(markup).toContain("ui-button");
    expect(markup).not.toContain("<button");
  });
});
