import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), "globals.css");
const css = readFileSync(cssPath, "utf8");

describe("globals.css", () => {
  it("does not contain shadcn bridge variable definitions", () => {
    expect(css).not.toContain("--background: var(--ds-");
    expect(css).not.toContain("--foreground: var(--ds-");
    expect(css).not.toContain("--primary: var(--ds-");
    expect(css).not.toContain("--muted: var(--ds-");
    expect(css).not.toContain("--accent: var(--ds-");
    expect(css).not.toContain("--destructive: var(--ds-");
    expect(css).not.toContain("--sidebar: var(--ds-");
  });
});
