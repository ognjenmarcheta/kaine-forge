import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "apps/api",
      "apps/desktop",
      "apps/mobile",
      "apps/web",
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
    ],
    passWithNoTests: true,
    coverage: {
      enabled: true,
      // vitest 4 reports only the files tests import unless `include` is set;
      // list the source roots so untested files still count as 0% (the vitest 3
      // `coverage.all` behavior the floors were calibrated against).
      include: ["apps/api/src/**", "apps/desktop/src/**", "apps/web/src/**", "packages/*/src/**"],
      exclude: [
        ".prettierrc.cjs",
        "**/*.test.*",
        "**/*.spec.*",
        "**/*.d.ts",
        "**/dist/**",
        "**/.turbo/**",
        "**/.worktrees/**",
        "**/generated/**",
        "**/playwright-report/**",
        "**/test-results/**",
        "**/*.config.*",
        ".ai/**",
        "scripts/**",
        "packages/config/eslint/**",
        "packages/config/prettier/**",
        "packages/config/tailwind/**",
        "tooling/**",
        "apps/e2e/**",
        // App shell has almost no unit coverage (~3% lines measured). Tests still
        // run via projects above (issue #143); re-include and floor once suite grows.
        "apps/mobile/**",
        "apps/desktop/src-tauri/**"
      ],
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      // Floors sit a few points below measured main with headroom for
      // agent-generated code. Raise gradually, not in big jumps.
      //
      // Re-baselined 2026-09-09 for vitest 4 (#329): v8 coverage now uses
      // AST-aware remapping, which counts functions and branches more strictly,
      // and `include` above keeps untested files at 0% as before. Measured at
      // 4.1.11: lines 49.9 / statements 49.2 / functions 43.2 / branches 42.3
      // (vitest 3.2.7 read 52.2 / 52.2 / 62.5 / 78.4 for the same tree).
      thresholds: {
        branches: 38,
        functions: 40,
        lines: 45,
        statements: 45,
        // High-risk packages held to a stricter, per-package bar. Folds in the
        // former `coverage:core` run so tests are not executed a third time.
        // Measured at 4.1.11: auth 83.4 / 83.1 / 88.6 / 79.4.
        "packages/auth/src/**": {
          branches: 75,
          functions: 80,
          lines: 80,
          statements: 80
        },
        // Measured at 4.1.11: api 62.0 / 61.1 / 51.7 / 56.9.
        "apps/api/src/**": {
          branches: 50,
          functions: 45,
          lines: 55,
          statements: 55
        },
        // Measured at 4.1.11: mobile-ui 57.5 / 57.5 / 44.8 / 38.7.
        "packages/mobile-ui/src/**": {
          branches: 35,
          functions: 40,
          lines: 50,
          statements: 50
        }
      }
    }
  }
});
