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
      "packages/jobs",
      "packages/logger",
      "packages/mobile-ui",
      "packages/persistence",
      "packages/query",
      "packages/storage",
      "packages/todos",
      "packages/theme",
      "packages/translation",
      "packages/billing",
      "packages/sync",
      "packages/ui",
      "packages/ui-3d"
    ],
    passWithNoTests: true,
    coverage: {
      enabled: true,
      // vitest 4 reports only the files tests import unless `include` is set;
      // list the source roots so untested files still count as 0% (the vitest 3
      // `coverage.all` behavior the floors were calibrated against).
      include: ["apps/api/src/**", "apps/desktop/src/**", "apps/web/src/**", "packages/*/src/**"],
      exclude: [
        "**/*.eval.live.ts",
        "**/*.eval.cli.ts",
        "**/*.eval.fixture.ts",
        ".prettierrc.cjs",
        "**/*.test.*",
        "**/*.spec.*",
        "**/*.d.ts",
        "**/*.graphql",
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
        // Local developer and agent tooling, not shipped app code: no coverage
        // floor. Its tests still gate pull requests through Check Fast.
        "tooling/**",
        "apps/e2e/**",
        // App shell has almost no unit coverage (~3% lines measured). Tests still
        // run via projects above; re-include and floor once suite grows.
        "apps/mobile/**",
        "apps/desktop/src-tauri/**"
      ],
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      // Each floor is floor(measured) minus 5, so a change that drops coverage
      // by more than about 5 points fails here. When measured coverage rises,
      // raise the floors by the same rule; never lower one without a reason.
      thresholds: {
        branches: 60,
        functions: 61,
        lines: 66,
        statements: 65,
        // High-risk packages held to a stricter, per-package bar. Folds in the
        // former `coverage:core` run so tests are not executed a third time.
        "packages/auth/src/**": {
          branches: 75,
          functions: 86,
          lines: 82,
          statements: 82
        },
        "apps/api/src/**": {
          branches: 72,
          functions: 77,
          lines: 76,
          statements: 75
        },
        "packages/mobile-ui/src/**": {
          branches: 68,
          functions: 75,
          lines: 85,
          statements: 84
        },
        "packages/billing/src/**": {
          branches: 66,
          functions: 57,
          lines: 63,
          statements: 64
        },
        "packages/sync/src/**": {
          branches: 81,
          functions: 75,
          lines: 88,
          statements: 84
        }
      }
    }
  }
});
