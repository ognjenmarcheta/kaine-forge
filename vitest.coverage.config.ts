import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "apps/api",
      "apps/desktop",
      "apps/web",
      "packages/auth",
      "packages/config",
      "packages/db",
      "packages/email",
      "packages/feature-flags",
      "packages/logger",
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
        "vitest.workspace.ts",
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
        "packages/mobile-ui/**",
        "tooling/**",
        "apps/e2e/**",
        "apps/mobile/**",
        "apps/desktop/src-tauri/**"
      ],
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        branches: 60,
        functions: 42,
        lines: 38,
        statements: 38
      }
    }
  }
});
