import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), "styles.css");
const css = readFileSync(cssPath, "utf8");

describe("web styles design-system contract", () => {
  it("does not keep legacy web selector blocks in app stylesheet", () => {
    expect(css).not.toMatch(/\.web-[a-z0-9_-]+\s*\{/i);
  });

  it("does not use legacy non-ds breakpoint cutoffs", () => {
    expect(css).not.toContain("@media (max-width: 900px)");
  });

  it("does not keep raw typography literals in app stylesheet", () => {
    expect(css).not.toContain("letter-spacing: 0.02em;");
    expect(css).not.toMatch(/font-size:\s*\d+px;/);
  });
});
