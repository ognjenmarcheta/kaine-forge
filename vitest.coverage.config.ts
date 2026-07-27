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
      // Floors sit below measured main (~51% lines / ~61% funcs / ~78% branches)
      // with headroom for agent-generated code. Raise gradually, not in big jumps.
      thresholds: {
        branches: 70,
        functions: 55,
        lines: 50,
        statements: 50,
        // High-risk packages held to a stricter, per-package bar. Folds in the
        // former `coverage:core` run so tests are not executed a third time, and
        // fixes its inverted functions floor (was 50, below the global 55).
        // Floors sit safely below measured coverage (auth ~85/91, api ~70/61).
        "packages/auth/src/**": {
          branches: 80,
          functions: 75,
          lines: 80,
          statements: 80
        },
        "apps/api/src/**": {
          branches: 70,
          functions: 55,
          lines: 60,
          statements: 60
        },
        // Measured ~50% lines / ~74% branches on mobile-ui alone; floor with headroom.
        "packages/mobile-ui/src/**": {
          branches: 50,
          functions: 45,
          lines: 40,
          statements: 40
        }
      }
    }
  }
});
