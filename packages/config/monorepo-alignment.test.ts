import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
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

function resolveRealModulePath(moduleName: string, relativeRoot: string): string {
  const scopedRequire = createRequire(resolve(repoRoot, relativeRoot, "package.json"));

  return realpathSync(scopedRequire.resolve(moduleName));
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

  it("defines token base layer with light and dark themes", () => {
    const globalsCss = readText("packages/ui/src/styles/globals.css");

    expect(globalsCss).toContain("--ds-base-");
    expect(globalsCss).toContain(':root[data-theme="dark"]');
    expect(globalsCss).not.toContain(':root[data-theme="light-high-contrast"]');
    expect(globalsCss).not.toContain(':root[data-theme="dark-high-contrast"]');
  });

  it("documents implemented theme modes consistently across guides", () => {
    const monorepoGuide = readText("MONOREPO_GUIDE.md");
    const designSystem = readText("DESIGN_SYSTEM.md");

    expect(monorepoGuide).toContain("token-only design system");
    expect(monorepoGuide).not.toContain("light-high-contrast");
    expect(monorepoGuide).not.toContain("dark-high-contrast");

    expect(designSystem).not.toContain("light-high-contrast");
    expect(designSystem).not.toContain("dark-high-contrast");
  });

  it("keeps GraphQL SDL naming guidance consistent", () => {
    const monorepoGuide = readText("MONOREPO_GUIDE.md");

    expect(monorepoGuide).toContain(
      "API feature SDL lives in `apps/api/src/features/{feature}/{feature}.schema.ts`"
    );
    expect(monorepoGuide).toContain("`.schema.ts`");
    expect(monorepoGuide).not.toContain(
      "- [ ] Create `{feature}.type.ts` — GraphQL type definitions."
    );
  });

  it("documents platform-specific styling stack accurately", () => {
    const monorepoGuide = readText("MONOREPO_GUIDE.md");

    expect(monorepoGuide).toContain("Tailwind CSS v4 for web/UI");
    expect(monorepoGuide).toContain("NativeWind with Tailwind CSS v3 pipeline for mobile");
  });

  it("uses feature-flags naming as the canonical package convention", () => {
    const monorepoGuide = readText("MONOREPO_GUIDE.md");

    expect(monorepoGuide).toContain("config-driven feature flags");
    expect(monorepoGuide).toContain("@repo/feature-flags");
    expect(monorepoGuide).not.toContain("packages/feature-flags/src/flags.config.ts");
  });

  it("does not expose legacy flags alias exports in feature-flags package", () => {
    const packageJson = readJson("packages/feature-flags/package.json") as {
      exports?: Record<string, unknown>;
    };
    const exportsMap = packageJson.exports ?? {};

    expect(exportsMap).not.toHaveProperty("./flags.definition");
    expect(exportsMap).not.toHaveProperty("./flags.config");
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

  it("keeps mobile shared UI on the app React Native singleton graph", () => {
    const singletonModules = [
      "react",
      "react-native",
      "nativewind",
      "react-native-css-interop",
      "react-native-reanimated",
      "react-native-safe-area-context",
      "react-native-worklets"
    ];

    for (const moduleName of singletonModules) {
      expect(resolveRealModulePath(moduleName, "packages/mobile-ui")).toBe(
        resolveRealModulePath(moduleName, "apps/mobile")
      );
    }
  });
});
