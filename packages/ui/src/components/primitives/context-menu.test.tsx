import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut } from "./context-menu";

describe("ContextMenu", () => {
  it("renders label with design token classes", () => {
    const markup = renderToStaticMarkup(<ContextMenuLabel>Edit</ContextMenuLabel>);
    expect(markup).toContain("text-[color:var(--ds-text)]");
    expect(markup).toContain("font-semibold");
  });

  it("renders separator with border token", () => {
    const markup = renderToStaticMarkup(<ContextMenuSeparator />);
    expect(markup).toContain("bg-[var(--ds-border)]");
  });

  it("renders shortcut with subtle text token", () => {
    const markup = renderToStaticMarkup(<ContextMenuShortcut>⌘C</ContextMenuShortcut>);
    expect(markup).toContain("text-[color:var(--ds-text-subtlest)]");
  });
});
