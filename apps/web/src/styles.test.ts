import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), "styles.css");
const css = readFileSync(cssPath, "utf8");
const sourceDir = dirname(fileURLToPath(import.meta.url));

const filesToCheckForLegacyWebClasses = [
  "router.tsx",
  "features/auth/auth.route.tsx",
  "features/auth/components/login-form.tsx",
  "features/auth/components/signup-form.tsx",
  "features/dashboard/components/dashboard-overview.tsx",
  "features/todos/todos.route.tsx",
  "features/todos/components/todo-item.tsx",
  "features/todos/components/todo-list.tsx"
] as const;

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

  it("does not keep legacy web class usage in core route/components", () => {
    for (const file of filesToCheckForLegacyWebClasses) {
      const source = readFileSync(resolve(sourceDir, file), "utf8");
      expect(source).not.toMatch(/\bweb-[a-z0-9_-]+\b/i);
    }
  });
});
