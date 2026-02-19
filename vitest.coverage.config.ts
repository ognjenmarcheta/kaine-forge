import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "apps/api",
      "apps/desktop",
      "apps/web",
      "packages/auth",
      "packages/db",
      "packages/translation",
      "packages/ui"
    ],
    passWithNoTests: true,
    coverage: {
      enabled: true,
      exclude: [
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
        "apps/e2e/**",
        "apps/mobile/**",
        "apps/desktop/src-tauri/**"
      ],
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        branches: 40,
        functions: 32,
        lines: 12,
        statements: 12
      }
    }
  }
});
