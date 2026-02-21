import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), "globals.css");
const cssSource = readFileSync(cssPath, "utf8");

const PHASE1_REQUIRED_TOKENS = [
  "--ds-blanket-selected",
  "--ds-background-neutral-subtle-pressed",
  "--ds-background-neutral-pressed",
  "--ds-background-neutral-bold-hovered",
  "--ds-background-neutral-bold-pressed",
  "--ds-background-brand-bold-pressed",
  "--ds-background-selected-hovered",
  "--ds-background-selected-pressed",
  "--ds-background-selected-bold-hovered",
  "--ds-background-selected-bold-pressed",
  "--ds-font-heading-display",
  "--ds-font-heading-xxlarge",
  "--ds-font-heading-xlarge",
  "--ds-font-heading-large",
  "--ds-font-heading-medium",
  "--ds-font-heading-small",
  "--ds-font-heading-xsmall",
  "--ds-font-heading-xxsmall",
  "--ds-font-body-large",
  "--ds-font-body",
  "--ds-font-body-small",
  "--ds-font-body-xsmall",
  "--ds-font-code",
  "--ds-breakpoint-sm",
  "--ds-breakpoint-md",
  "--ds-breakpoint-lg",
  "--ds-breakpoint-xl"
] as const;

describe("globals.css token contract", () => {
  it("defines all phase 1 required design tokens", () => {
    for (const token of PHASE1_REQUIRED_TOKENS) {
      expect(cssSource).toContain(`${token}:`);
    }
  });

  it("uses explicit token states for button hover/active styles", () => {
    expect(cssSource).not.toContain("filter: brightness");
    expect(cssSource).not.toContain("color-mix(");
    expect(cssSource).toContain("var(--ds-background-brand-bold-hovered)");
    expect(cssSource).toContain("var(--ds-background-brand-bold-pressed)");
    expect(cssSource).toContain("var(--ds-background-neutral-hovered)");
    expect(cssSource).toContain("var(--ds-background-neutral-pressed)");
  });

  it("keeps overlay elevation pairing for select content", () => {
    expect(cssSource).toMatch(
      /\.ui-select__content\s*\{[^}]*background:\s*var\(--ds-surface-overlay\);[^}]*box-shadow:\s*var\(--ds-shadow-overlay\);/s
    );
  });

  it("maps sidebar bridge tokens to ds semantic tokens", () => {
    expect(cssSource).not.toContain("--sidebar: hsl(");
    expect(cssSource).toContain("--sidebar: var(--ds-surface-sunken);");
    expect(cssSource).toContain("--sidebar-foreground: var(--ds-text);");
    expect(cssSource).toContain("--sidebar-primary: var(--ds-background-brand-bold);");
    expect(cssSource).toContain("--sidebar-border: var(--ds-border);");
  });

  it("avoids raw typography literals in shared ui utility classes", () => {
    expect(cssSource).not.toContain("letter-spacing: 0.02em;");
    expect(cssSource).not.toContain("font-size: 10px;");
    expect(cssSource).not.toContain("font-size: 11px;");
    expect(cssSource).not.toContain("font-size: 12px;");
    expect(cssSource).not.toContain("font-size: 13px;");
    expect(cssSource).not.toContain("font-size: 14px;");
    expect(cssSource).not.toContain("font-size: 20px;");
  });
});
