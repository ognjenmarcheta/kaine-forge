import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), "sidebar.tsx");
const source = readFileSync(sourcePath, "utf8");

describe("Sidebar token semantics", () => {
  it("does not wrap sidebar token variables in hsl() runtime helpers", () => {
    expect(source).not.toContain("hsl(var(--sidebar-border))");
    expect(source).not.toContain("hsl(var(--sidebar-accent))");
  });

  it("uses only --ds-* token references, not sidebar bridge variables", () => {
    expect(source).not.toContain("bg-sidebar-accent");
    expect(source).not.toContain("text-sidebar-foreground");
    expect(source).not.toContain("bg-sidebar-primary");
    expect(source).not.toContain("border-sidebar-border");
    expect(source).not.toContain("ring-sidebar-ring");
  });
});
