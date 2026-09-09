import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
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

/** Walk production TS/TSX sources (skip tests and generated). */
function listSourceFiles(relativeDir: string): string[] {
  const absDir = resolve(repoRoot, relativeDir);
  const out: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "generated") continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (/\.(test|spec)\./.test(entry.name)) continue;
      out.push(relative(repoRoot, abs));
    }
  };

  walk(absDir);
  return out;
}

/**
 * Map `@repo/auth/form` → { packageName: @repo/auth, exportKey: ./form }.
 * Bare `@repo/auth` → exportKey `.`.
 */
function parseRepoSpecifier(specifier: string): { packageName: string; exportKey: string } | null {
  const match = /^(@repo\/[^/]+)(?:\/(.+))?$/.exec(specifier);
  if (!match) return null;
  const packageName = match[1];
  const rest = match[2];
  return {
    packageName,
    exportKey: rest ? `./${rest}` : "."
  };
}

function collectRepoImportSpecifiers(relativeDirs: string[]): string[] {
  const importRe = /from\s+["'](@repo\/[^"']+)["']/g;
  const specs = new Set<string>();

  for (const dir of relativeDirs) {
    for (const file of listSourceFiles(dir)) {
      const text = readText(file);
      let match: RegExpExecArray | null;
      while ((match = importRe.exec(text)) !== null) {
        specs.add(match[1]);
      }
    }
  }

  return [...specs].sort();
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

  it("keeps root script names off pnpm built-in commands (issue #307)", () => {
    // pnpm resolves its own commands before package scripts, so a script named
    // `doctor` was unreachable as `pnpm doctor`: pnpm's built-in doctor ran and
    // printed "All checks passed" while scripts/doctor.mjs never executed.
    // test/start/stop/restart are the documented exceptions pnpm routes to scripts.
    const pnpmBuiltinCommands = new Set([
      "add",
      "approve-builds",
      "audit",
      "bin",
      "cache",
      "cat-file",
      "cat-index",
      "config",
      "create",
      "dedupe",
      "deploy",
      "dlx",
      "doctor",
      "env",
      "exec",
      "fetch",
      "find-hash",
      "help",
      "ignored-builds",
      "import",
      "init",
      "install",
      "licenses",
      "link",
      "list",
      "ls",
      "outdated",
      "pack",
      "patch",
      "patch-commit",
      "patch-remove",
      "prune",
      "publish",
      "rebuild",
      "recursive",
      "remove",
      "root",
      "run",
      "self-update",
      "server",
      "setup",
      "store",
      "unlink",
      "update",
      "why"
    ]);
    const rootPackage = readJson("package.json") as { scripts?: Record<string, string> };
    const collisions = Object.keys(rootPackage.scripts ?? {}).filter((name) =>
      pnpmBuiltinCommands.has(name)
    );

    expect(
      collisions,
      "rename these scripts: `pnpm <name>` runs the pnpm built-in, never the script"
    ).toEqual([]);
  });

  it("keeps pnpm bootstrap off the Tauri desktop compile (issue #351)", () => {
    // `pnpm run build` is `turbo run build` across every workspace, which
    // includes @repo/desktop#build = `tauri build --no-bundle`: a full Rust
    // compile that a fresh clone without Rust cannot run and one with Rust did
    // not ask for. Bootstrap must build with the desktop app filtered out.
    const rootPackage = readJson("package.json") as { scripts?: Record<string, string> };
    const bootstrapSteps = (rootPackage.scripts?.bootstrap ?? "")
      .split("&&")
      .map((step) => step.trim());

    expect(bootstrapSteps).not.toContain("pnpm run build");
    expect(bootstrapSteps).toContain("turbo run build --filter=!@repo/desktop");
  });

  it("keeps the importable main ruleset aligned with the workflow job names (issue #325)", () => {
    // Required checks are matched by job name. A renamed job with a stale
    // ruleset would block every merge once the ruleset is applied, or silently
    // stop requiring the check. Job names are the 4-space `name:` keys under
    // `jobs:` in the PR workflows.
    const ruleset = readJson(".github/rulesets/main.json") as {
      rules?: { type: string; parameters?: { required_status_checks?: { context: string }[] } }[];
    };
    const required = (ruleset.rules ?? [])
      .filter((rule) => rule.type === "required_status_checks")
      .flatMap((rule) => rule.parameters?.required_status_checks ?? [])
      .map((check) => check.context);
    expect(required.length).toBeGreaterThan(0);

    // Matrix jobs render their name per entry; the ruleset lists the rendered names.
    const rendered = (name: string): string[] =>
      name.includes("${{ matrix.app }}")
        ? ["api", "web"].map((app) => name.replace("${{ matrix.app }}", app))
        : name.includes("${{ matrix.shard }}")
          ? ["1", "2"].map((shard) => name.replace("${{ matrix.shard }}", shard))
          : [name];

    // Rendered job name -> the workflow that produces the check.
    const checkWorkflows = new Map<string, string>();
    const mergeGroupWorkflows = new Set<string>();
    for (const workflow of [".github/workflows/ci-pr.yml", ".github/workflows/codeql.yml"]) {
      const text = readText(workflow);
      if (/^ {2}merge_group:/m.test(text)) mergeGroupWorkflows.add(workflow);
      for (const match of text.matchAll(/^ {4}name: (.+)$/gm)) {
        for (const name of rendered(match[1].trim())) checkWorkflows.set(name, workflow);
      }
    }

    const unknown = required.filter((context) => !checkWorkflows.has(context));
    expect(unknown, "ruleset contexts must match workflow job names").toEqual([]);

    // The merge queue runs checks on a `merge_group` event. A required check whose
    // workflow never triggers there stalls every queue entry until the ruleset's
    // `check_response_timeout_minutes` elapses, then fails it (issue #354).
    const missingMergeGroup = required.flatMap((context) => {
      const workflow = checkWorkflows.get(context);
      return workflow === undefined || mergeGroupWorkflows.has(workflow)
        ? []
        : [`${workflow}: add \`merge_group:\` under \`on:\` — the ruleset requires "${context}"`];
    });
    expect(missingMergeGroup, "required checks must run on merge_group").toEqual([]);
  });

  it("keeps typecheck base non-composite with incremental (issue #147 dual-config)", () => {
    // IDE / turbo typecheck stays on source paths. Emit uses composite build configs.
    const sharedBase = readJson("packages/config/typescript/tsconfig.base.json") as {
      compilerOptions?: Record<string, unknown>;
    };
    const compilerOptions = sharedBase.compilerOptions ?? {};

    expect(compilerOptions.composite).toBe(false);
    expect(compilerOptions.incremental).toBe(true);
    expect(compilerOptions.tsBuildInfoFile).toBe("${configDir}/.tsbuildinfo");
    expect(readText(".gitignore")).toMatch(/tsbuildinfo/);
  });

  it("uses composite project references for every tsc-emitting workspace (issue #147)", () => {
    // Dual-config: tsconfig.json typechecks with source paths; tsconfig.build.json
    // is composite + paths: {} + tsc -b so emit resolves @repo/* via references/dist.
    const packageNameToBuildDir: Record<string, string> = {
      "@repo/logger": "packages/logger",
      "@repo/email": "packages/email",
      "@repo/db": "packages/db",
      "@repo/auth": "packages/auth",
      "@repo/feature-flags": "packages/feature-flags",
      "@repo/storage": "packages/storage",
      "@repo/translation": "packages/translation",
      "@repo/todos": "packages/todos",
      "@repo/query": "packages/query",
      "@repo/persistence": "packages/persistence",
      "@repo/ui": "packages/ui",
      "@repo/mobile-ui": "packages/mobile-ui",
      "@repo/api": "apps/api"
    };

    const workspaceDirs = [
      ...readdirSync(resolve(repoRoot, "packages"), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `packages/${e.name}`),
      ...readdirSync(resolve(repoRoot, "apps"), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `apps/${e.name}`)
    ];

    const tscEmitDirs: string[] = [];

    for (const dir of workspaceDirs) {
      const packageJsonPath = `${dir}/package.json`;
      try {
        readText(packageJsonPath);
      } catch {
        continue;
      }
      const packageJson = readJson(packageJsonPath) as {
        name?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const build = packageJson.scripts?.build ?? "";
      // Emit builds only (skip typecheck-as-build like mobile's `tsc --noEmit`).
      if (!/\btsc\b/.test(build) || /--noEmit/.test(build)) continue;

      tscEmitDirs.push(dir);

      expect(build).toMatch(/tsc -b/);
      expect(build).toContain("tsconfig.build.json");

      const buildConfig = readJson(`${dir}/tsconfig.build.json`) as {
        compilerOptions?: Record<string, unknown>;
        exclude?: string[];
        references?: { path: string }[];
      };

      expect(buildConfig.compilerOptions).toMatchObject({
        composite: true,
        rootDir: "src",
        outDir: "dist",
        paths: {}
      });
      expect(buildConfig.exclude?.some((pattern) => pattern.includes("*.test.ts"))).toBe(true);

      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
      const expectedRefPaths = Object.keys(deps ?? {})
        .filter((name) => name in packageNameToBuildDir && packageNameToBuildDir[name] !== dir)
        .map((name) => {
          const depDir = packageNameToBuildDir[name];
          // Prefer relative path ending with dep's tsconfig.build.json
          return `${depDir}/tsconfig.build.json`;
        });

      const actualRefPaths = (buildConfig.references ?? []).map((ref) => {
        // Normalize to repo-relative for comparison
        const abs = resolve(repoRoot, dir, ref.path);
        return relative(repoRoot, abs).replaceAll("\\", "/");
      });

      for (const expected of expectedRefPaths) {
        expect(actualRefPaths).toContain(expected);
      }
    }

    // Sanity: the known tsc graph is present (not only api).
    expect(tscEmitDirs).toEqual(
      expect.arrayContaining([
        "packages/logger",
        "packages/email",
        "packages/auth",
        "packages/db",
        "apps/api"
      ])
    );
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
        paths: {},
        composite: true
      });
      expect(buildConfig.exclude?.some((pattern) => pattern.includes("*.test.ts"))).toBe(true);
      expect(packageJson.scripts?.build).toMatch(/tsc -b/);
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
    // Client bundles must never resolve the root barrel (issue #305).
    assertPackageHasExports("packages/storage/package.json", [".", "./client"]);
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

  it("api and web @repo imports resolve through package exports maps (issue #148)", () => {
    // Default typecheck maps @repo/* to source via tsconfig paths, so a subpath
    // can typecheck green while missing from package.json exports (runtime fail).
    // Consumer-driven check: every production import must be a published export.
    const packageDirByName: Record<string, string> = {
      "@repo/auth": "packages/auth",
      "@repo/db": "packages/db",
      "@repo/email": "packages/email",
      "@repo/feature-flags": "packages/feature-flags",
      "@repo/logger": "packages/logger",
      "@repo/persistence": "packages/persistence",
      "@repo/query": "packages/query",
      "@repo/storage": "packages/storage",
      "@repo/todos": "packages/todos",
      "@repo/translation": "packages/translation",
      "@repo/ui": "packages/ui"
    };

    const specs = collectRepoImportSpecifiers(["apps/api/src", "apps/web/src"]);
    expect(specs.length).toBeGreaterThan(0);

    const missing: string[] = [];

    for (const specifier of specs) {
      const parsed = parseRepoSpecifier(specifier);
      if (!parsed) {
        missing.push(`${specifier} (unparseable)`);
        continue;
      }

      const packageDir = packageDirByName[parsed.packageName];
      if (!packageDir) {
        // Unknown workspace package — surface so the map stays complete.
        missing.push(`${specifier} (no package dir for ${parsed.packageName})`);
        continue;
      }

      const packageJson = readJson(`${packageDir}/package.json`) as {
        exports?: Record<string, unknown> | string;
      };
      const exportsMap = packageJson.exports;

      if (!exportsMap || typeof exportsMap === "string") {
        // String exports only cover the package root.
        if (parsed.exportKey !== ".") {
          missing.push(`${specifier} (package has string exports, no subpath ${parsed.exportKey})`);
        }
        continue;
      }

      if (!(parsed.exportKey in exportsMap)) {
        missing.push(`${specifier} (missing exports key ${parsed.exportKey} in ${packageDir})`);
      }
    }

    expect(missing).toEqual([]);
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

    // Dual-lane / intentional exceptions: web catalog: vs catalog:mobile, and
    // packages/mobile-ui peer ranges that stay wider than the pinned mobile graph.
    const dualLanePackages = new Set([
      "react",
      "react-dom",
      "@types/react",
      "@types/react-dom",
      "tailwindcss",
      "nativewind",
      "react-native",
      "react-native-css-interop",
      "react-native-reanimated",
      "react-native-safe-area-context",
      "react-native-worklets"
    ]);

    const tracked = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8" }).split("\n");
    const manifests = tracked.filter((file) =>
      /^(apps|packages|tooling)\/[^/]+\/package\.json$/.test(file)
    );

    const declarations = new Map<string, Array<{ manifest: string; value: string }>>();

    for (const manifest of manifests) {
      const packageJson = readJson(manifest) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      for (const section of ["dependencies", "devDependencies"] as const) {
        for (const [dep, value] of Object.entries(packageJson[section] ?? {})) {
          if (dep.startsWith("@repo/") || value.startsWith("workspace:")) {
            continue;
          }
          const list = declarations.get(dep) ?? [];
          list.push({ manifest, value });
          declarations.set(dep, list);
        }
      }
    }

    for (const [dep, entries] of declarations) {
      if (entries.length < 2) {
        continue;
      }
      if (dualLanePackages.has(dep)) {
        for (const { manifest, value } of entries) {
          expect(
            value === "catalog:" || value === "catalog:mobile",
            `${manifest} declares ${dep} as "${value}"; multi-workspace deps must use catalog: or catalog:mobile`
          ).toBe(true);
        }
        continue;
      }

      for (const { manifest, value } of entries) {
        expect(
          value,
          `${manifest} declares ${dep} as "${value}"; any dependency used by two or more workspaces must be "catalog:"`
        ).toBe("catalog:");
      }
    }

    // Keep coverage tooling lockstep with cataloged vitest.
    const rootPackage = readJson("package.json") as {
      devDependencies?: Record<string, string>;
    };
    expect(rootPackage.devDependencies?.["@vitest/coverage-v8"]).toBe("catalog:");
    // Lockstep, not a frozen major: all three catalog entries must share the
    // same version string, so a lone bump (#320 moved vitest to 4.1.11 and left
    // the companions on 3.2.6) fails here before it fails in the coverage run.
    const catalogVersion = (name: string): string | undefined =>
      new RegExp(`^\\s*"?${name.replace("/", "\\/")}"?:\\s*"([^"]+)"`, "m").exec(workspace)?.[1];
    const vitestVersion = catalogVersion("vitest");
    expect(vitestVersion, "vitest must be cataloged").toBeTruthy();
    expect(catalogVersion("@vitest/coverage-v8")).toBe(vitestVersion);
    expect(catalogVersion("@vitest/ui")).toBe(vitestVersion);
  });

  it("excludes build output from every vitest workspace (vitest 4 default exclude)", () => {
    // Vitest 4 only excludes node_modules and .git by default, so compiled
    // tests left in dist/ from an older build run and fail against missing
    // source files. Every workspace that runs vitest must spread the shared
    // list from @repo/config/vitest in its own vitest.config.ts, which also
    // covers the root coverage run's projects list.
    const tracked = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8" }).split("\n");
    const manifests = tracked.filter((file) =>
      /^(apps|packages|tooling)\/[^/]+\/package\.json$/.test(file)
    );
    const missing: string[] = [];

    for (const manifest of manifests) {
      const workspaceDir = manifest.replace(/\/package\.json$/, "");
      const packageJson = readJson(manifest) as { scripts?: Record<string, string> };
      if (!/\bvitest\b/.test(packageJson.scripts?.test ?? "")) continue;

      const configPath = `${workspaceDir}/vitest.config.ts`;
      if (!existsSync(resolve(repoRoot, configPath))) {
        missing.push(`${workspaceDir}: no vitest.config.ts`);
        continue;
      }
      if (!readText(configPath).includes("vitestExclude")) {
        missing.push(`${workspaceDir}: vitest.config.ts does not use vitestExclude`);
      }
    }

    expect(missing).toEqual([]);
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

  it("keeps server-only package entries out of client bundles (issue #305)", () => {
    // The storage root barrel re-exported the S3 client, which pulled
    // @aws-sdk/client-s3 into the Expo bundle. Both client blocks (web/desktop/ui
    // and mobile/mobile-ui) must carry the server-only gate, and it must be an
    // anchored regex: a gitignore-style `@repo/storage` group also matches the
    // client-safe `@repo/storage/client` subpath.
    const eslintBase = readText("packages/config/eslint/base.js");
    const pattern = /SERVER_ONLY_ENTRY_PATTERN =\s*"([^"]+)"/.exec(eslintBase)?.[1];
    expect(pattern, "base.js must define SERVER_ONLY_ENTRY_PATTERN").toBeTruthy();
    expect(eslintBase.match(/regex: SERVER_ONLY_ENTRY_PATTERN/g)).toHaveLength(2);

    const serverOnly = new RegExp(pattern ?? "");
    for (const specifier of [
      "@repo/storage",
      "@repo/storage/storage.client",
      "@repo/auth",
      "@repo/auth/server",
      "@repo/auth/instance",
      "@repo/db",
      "@repo/db/client",
      "@repo/email"
    ]) {
      expect(serverOnly.test(specifier), `${specifier} must be blocked in clients`).toBe(true);
    }
    for (const specifier of [
      "@repo/storage/client",
      "@repo/storage/upload.lifecycle",
      "@repo/auth/client",
      "@repo/auth/session",
      "@repo/auth/transport",
      "@repo/auth/form",
      "@repo/logger"
    ]) {
      expect(serverOnly.test(specifier), `${specifier} must stay importable`).toBe(false);
    }
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

  it("invalidates dependent typecheck and lint when a dependency or shared preset changes (issue #308)", () => {
    // typecheck resolves @repo/* to sibling source through tsconfig.base.json
    // paths, so a dependency's type change must reach the dependent's hash.
    // Reproduced before the fix: editing packages/storage/src left
    // @repo/web#typecheck on a cache HIT. Lint's typed rules and prettier read
    // the shared presets in packages/config, which sit outside every package.
    const turboConfig = readJson("turbo.json") as {
      tasks?: Record<string, { dependsOn?: string[]; inputs?: string[] }>;
    };
    const tasks = turboConfig.tasks ?? {};
    const presetGlob = "$TURBO_ROOT$/packages/config/typescript/*.json";

    expect(tasks.typecheck?.dependsOn).toContain("^typecheck");
    expect(tasks.typecheck?.inputs).toContain(presetGlob);
    expect(tasks.lint?.inputs).toContain(presetGlob);
    expect(tasks["format:check"]?.inputs).toContain("$TURBO_ROOT$/packages/config/prettier/**");
    expect(tasks["format:check"]?.inputs).toContain("$TURBO_ROOT$/.editorconfig");
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
