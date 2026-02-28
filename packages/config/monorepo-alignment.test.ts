import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageRoot, "../..");

function readJson(relativePath: string): Record<string, unknown> {
  const raw = readFileSync(resolve(repoRoot, relativePath), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function readText(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function assertPackageHasExports(relativePath: string, expectedSubpaths: string[]): void {
  const packageJson = readJson(relativePath) as {
    exports?: Record<string, unknown>;
  };

  const exportsMap = packageJson.exports ?? {};

  for (const subpath of expectedSubpaths) {
    expect(exportsMap).toHaveProperty(subpath);
  }
}

describe("monorepo alignment", () => {
  it("enforces strict compiler options from MONOREPO_GUIDE", () => {
    const tsconfig = readJson("tsconfig.base.json") as {
      compilerOptions?: Record<string, unknown>;
    };
    const compilerOptions = tsconfig.compilerOptions ?? {};

    expect(compilerOptions).toMatchObject({
      exactOptionalPropertyTypes: true,
      noFallthroughCasesInSwitch: true,
      noImplicitReturns: true,
      strict: true
    });
  });

  it("publishes documented subpath exports for core packages", () => {
    assertPackageHasExports("packages/db/package.json", [
      ".",
      "./client",
      "./schema",
      "./types",
      "./validators"
    ]);
    assertPackageHasExports("packages/translation/package.json", [
      ".",
      "./translation.config",
      "./translation.definition",
      "./translation.type",
      "./translation.util"
    ]);
    assertPackageHasExports("packages/query/package.json", [
      ".",
      "./query.definition",
      "./query.util"
    ]);
    assertPackageHasExports("packages/feature-flags/package.json", [
      ".",
      "./feature-flags.definition",
      "./feature-flags.type",
      "./feature-flags.util"
    ]);
    assertPackageHasExports("packages/ui/package.json", [
      ".",
      "./primitives/sidebar",
      "./primitives/sheet",
      "./styles/globals.css"
    ]);
  });

  it("defines token base layer and high-contrast theme selectors", () => {
    const globalsCss = readText("packages/ui/src/styles/globals.css");

    expect(globalsCss).toContain("--ds-base-");
    expect(globalsCss).toContain(':root[data-theme="light-high-contrast"]');
    expect(globalsCss).toContain(':root[data-theme="dark-high-contrast"]');
  });

  it("avoids hardcoded english labels in shared ui primitives", () => {
    const sheetSource = readText("packages/ui/src/components/primitives/sheet.tsx");
    const sidebarSource = readText("packages/ui/src/components/primitives/sidebar.tsx");

    expect(sheetSource).not.toContain(">Close<");
    expect(sidebarSource).not.toContain(">Sidebar<");
    expect(sidebarSource).not.toContain(">Toggle Sidebar<");
    expect(sidebarSource).not.toContain("Displays the mobile sidebar.");
    expect(sidebarSource).not.toContain('aria-label="Toggle Sidebar"');
    expect(sidebarSource).not.toContain('title="Toggle Sidebar"');
  });

  it("avoids hardcoded loading placeholders in app and shared ui code", () => {
    const files = [
      "apps/web/src/features/auth/components/login-form.tsx",
      "apps/web/src/features/auth/components/signup-form.tsx",
      "apps/mobile/src/features/auth/components/login-form.tsx",
      "apps/mobile/src/features/auth/components/signup-form.tsx",
      "apps/mobile/src/features/todos/components/todo-form-modal.tsx",
      "apps/mobile/src/components/confirm-modal.tsx",
      "packages/ui/src/components/primitives/form-modal.tsx",
      "packages/ui/src/components/primitives/modal.tsx"
    ];

    for (const file of files) {
      expect(readText(file)).not.toContain('"..."');
    }
  });
});
