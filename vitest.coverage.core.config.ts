import { defineConfig } from "vitest/config";

/**
 * Stricter coverage for high-risk packages (@repo/auth, @repo/api).
 * Run via `pnpm coverage:core` (CI after global coverage).
 */
export default defineConfig({
  test: {
    projects: ["apps/api", "packages/auth"],
    passWithNoTests: false,
    coverage: {
      enabled: true,
      // Limit the denominator to auth + api so UI/other packages do not dilute floors.
      include: ["apps/api/src/**/*.{ts,tsx}", "packages/auth/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.*",
        "**/*.spec.*",
        "**/*.d.ts",
        "**/dist/**",
        "**/.turbo/**",
        "**/generated/**",
        "**/*.config.*"
      ],
      provider: "v8",
      reporter: ["text", "json-summary"],
      // Measured approx: auth ~85% lines, api ~66% lines / ~55% functions.
      thresholds: {
        branches: 75,
        functions: 50,
        lines: 60,
        statements: 60
      }
    }
  }
});
