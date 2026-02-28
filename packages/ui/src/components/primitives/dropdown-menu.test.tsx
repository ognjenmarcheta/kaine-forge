import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut } from "./dropdown-menu";

describe("DropdownMenu", () => {
  it("renders label with design token classes", () => {
    const markup = renderToStaticMarkup(<DropdownMenuLabel>Actions</DropdownMenuLabel>);
    expect(markup).toContain("text-[color:var(--ds-text)]");
    expect(markup).toContain("font-semibold");
    expect(markup).toContain("Actions");
  });

  it("renders separator with border token", () => {
    const markup = renderToStaticMarkup(<DropdownMenuSeparator />);
    expect(markup).toContain("bg-[var(--ds-border)]");
  });

  it("renders shortcut with subtle text token", () => {
    const markup = renderToStaticMarkup(<DropdownMenuShortcut>⌘K</DropdownMenuShortcut>);
    expect(markup).toContain("text-[color:var(--ds-text-subtlest)]");
    expect(markup).toContain("⌘K");
  });
});
