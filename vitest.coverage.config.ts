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
      reporter: ["text", "lcov", "json-summary"],
      // Floors sit below measured main (~51% lines / ~61% funcs / ~78% branches)
      // with headroom for agent-generated code. Raise gradually, not in big jumps.
      thresholds: {
        branches: 70,
        functions: 55,
        lines: 50,
        statements: 50
      }
    }
  }
});
