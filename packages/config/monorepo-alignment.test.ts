import { execSync } from "node:child_process";
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

  it("emits flat dist for Docker-backed tsc packages (no nested monorepo paths)", () => {
    // Root paths map @repo/* to source, which widens tsc rootDir and nests dist
    // (e.g. apps/api/dist/apps/api/src). Production builds clear paths and pin rootDir.
    const dockerBackedPackages = ["packages/email", "packages/auth", "apps/api"] as const;

    for (const packageDir of dockerBackedPackages) {
      const buildConfig = readJson(`${packageDir}/tsconfig.build.json`) as {
        compilerOptions?: Record<string, unknown>;
        exclude?: string[];
      };
      const packageJson = readJson(`${packageDir}/package.json`) as {
        scripts?: Record<string, string>;
      };

      expect(buildConfig.compilerOptions).toMatchObject({
        rootDir: "src",
        outDir: "dist",
        paths: {}
      });
      expect(buildConfig.exclude?.some((pattern) => pattern.includes("*.test.ts"))).toBe(true);
      expect(packageJson.scripts?.build).toContain("tsconfig.build.json");
    }

    expect(readText("Dockerfile.api")).toContain("test -f apps/api/dist/index.js");
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

  it("centralizes shared third-party versions via pnpm catalogs", () => {
    const workspace = readText("pnpm-workspace.yaml");

    expect(workspace).toContain("catalog:");
    expect(workspace).toMatch(/catalogs:\s*\n(?:[^\n]*\n)*?\s*mobile:/);
    expect(workspace).toContain("zod:");

    const catalogedPackages = [
      ["packages/db/package.json", "dependencies", "zod", "catalog:"],
      ["packages/auth/package.json", "dependencies", "zod", "catalog:"],
      ["apps/api/package.json", "dependencies", "zod", "catalog:"],
      ["apps/web/package.json", "dependencies", "react", "catalog:"],
      ["packages/ui/package.json", "dependencies", "react", "catalog:"],
      ["apps/mobile/package.json", "dependencies", "react", "catalog:mobile"],
      ["packages/mobile-ui/package.json", "devDependencies", "react", "catalog:mobile"]
    ] as const;

    for (const [pkgPath, section, dep, expected] of catalogedPackages) {
      const pkg = readJson(pkgPath) as Record<string, Record<string, string>>;
      expect(pkg[section]?.[dep]).toBe(expected);
    }
  });

  it("documents web vs mobile React version policy", () => {
    const monorepoGuide = readText("MONOREPO_GUIDE.md");

    expect(monorepoGuide).toContain("catalog:mobile");
    expect(monorepoGuide).toContain("Dependency catalogs (pnpm)");
    expect(monorepoGuide).toContain("web React");
  });

  it("restricts deep package source imports and cross-platform UI packages", () => {
    const eslintBase = readText("packages/config/eslint/base.js");

    expect(eslintBase).toContain("@repo/*/src");
    expect(eslintBase).toContain("@repo/mobile-ui");
    expect(eslintBase).toContain("@repo/ui");
    expect(eslintBase).toContain("no-restricted-imports");
  });

  it("requires each source workspace to ship at least one vitest test", () => {
    // Every workspace uses `vitest run --passWithNoTests`, so a package with no
    // tests still passes green. This gate keeps that flag safe by asserting the
    // testable workspaces actually ship tests. apps/e2e is excluded: it ships
    // Playwright specs, not vitest unit tests.
    const workspaces = [
      "apps/api",
      "apps/web",
      "apps/mobile",
      "apps/desktop",
      "packages/auth",
      "packages/config",
      "packages/db",
      "packages/email",
      "packages/feature-flags",
      "packages/logger",
      "packages/mobile-ui",
      "packages/persistence",
      "packages/query",
      "packages/storage",
      "packages/todos",
      "packages/translation",
      "packages/ui"
    ];
    const tracked = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8" }).split("\n");

    for (const workspace of workspaces) {
      const hasTest = tracked.some(
        (file) => file.startsWith(`${workspace}/`) && /\.(test|spec)\.(ts|tsx)$/.test(file)
      );
      expect(hasTest, `${workspace} must ship at least one *.test.ts(x) file`).toBe(true);
    }
  });

  it("requires every workspace to declare @repo/config so turbo can see the preset edge", () => {
    const tracked = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8" }).split("\n");
    const manifests = tracked.filter((file) =>
      /^(apps|packages|tooling)\/[^/]+\/package\.json$/.test(file)
    );

    expect(manifests.length).toBeGreaterThan(1);

    for (const manifest of manifests) {
      if (manifest === "packages/config/package.json") {
        continue;
      }

      const packageJson = readJson(manifest) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const declared = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {})
      };

      expect(
        declared["@repo/config"],
        `${packageJson.name ?? manifest} must declare @repo/config. Every workspace consumes its ` +
          `eslint, prettier, tsconfig, or tailwind presets, and the declared edge is what lets ` +
          `turbo prune include it in Docker builds and lets release-apps derive affected apps ` +
          `from the graph instead of a hardcoded path.`
      ).toBe("workspace:*");
    }
  });

  it("keeps broad invalidation triggers out of turbo globalDependencies", () => {
    const turboConfig = readJson("turbo.json") as { globalDependencies?: string[] };
    const globalDependencies = turboConfig.globalDependencies ?? [];

    // Turborepo already hashes each package's resolved external dependencies, so listing the
    // whole lockfile here invalidates every task in every package on any dependency bump.
    expect(globalDependencies).not.toContain("pnpm-lock.yaml");

    // packages/config reaches the graph through declared dependencies now. Globbing it here also
    // pulled gitignored .turbo/*.log files and CHANGELOG.md into the global hash.
    for (const entry of globalDependencies) {
      expect(entry.startsWith("packages/"), `globalDependencies must not glob ${entry}`).toBe(
        false
      );
    }
  });

  it("builds deployable images from turbo prune output only", () => {
    for (const dockerfile of ["Dockerfile.api", "Dockerfile.web"]) {
      expect(
        readText(dockerfile),
        `${dockerfile} must not hand-copy packages/config. It is part of the pruned graph now, ` +
          `and an out-of-band COPY silently diverges from the declared dependencies.`
      ).not.toContain("/app/packages/config/");
    }
  });

  it("requires workspaces that import vitest to declare it", () => {
    const tracked = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8" }).split("\n");
    const importers = new Set<string>();

    for (const file of tracked) {
      if (!/^(apps|packages|tooling)\/[^/]+\/.*\.tsx?$/.test(file)) {
        continue;
      }
      if (/from "vitest"|from "vitest\//.test(readText(file))) {
        importers.add(file.split("/").slice(0, 2).join("/"));
      }
    }

    expect(importers.size).toBeGreaterThan(0);

    for (const workspace of importers) {
      const packageJson = readJson(`${workspace}/package.json`) as {
        name?: string;
        devDependencies?: Record<string, string>;
      };

      expect(
        packageJson.devDependencies?.vitest,
        `${packageJson.name ?? workspace} imports vitest but does not declare it. Relying on ` +
          `pnpm root hoisting hides the dependency from \`turbo boundaries\` and breaks a ` +
          `standalone \`pnpm --filter <workspace> test\`.`
      ).toBe("catalog:");
    }
  });

  it("keeps eslint plugins declared by the package that imports them", () => {
    const configPackage = readJson("packages/config/package.json") as {
      devDependencies?: Record<string, string>;
    };
    const rootPackage = readJson("package.json") as {
      devDependencies?: Record<string, string>;
    };

    for (const plugin of [
      "@eslint/js",
      "eslint-plugin-import",
      "eslint-plugin-react",
      "eslint-plugin-react-hooks",
      "globals",
      "typescript-eslint"
    ]) {
      expect(
        configPackage.devDependencies?.[plugin],
        `packages/config/eslint/*.js imports ${plugin}, so @repo/config must declare it.`
      ).toBeDefined();
      expect(
        rootPackage.devDependencies?.[plugin],
        `${plugin} belongs to @repo/config, not the root. The root eslint.config.mjs only ` +
          `re-exports the shared config and never imports plugins directly.`
      ).toBeUndefined();
    }
  });
});
