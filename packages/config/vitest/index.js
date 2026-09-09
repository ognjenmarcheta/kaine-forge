// Vitest 4 excludes only node_modules and .git by default (3.x also skipped
// dist, .turbo, coverage, and report folders). Build output can hold compiled
// tests from older builds, so every workspace vitest.config.ts uses this list.
// Kept as data, not a defineConfig call, so workspaces with their own aliases
// or environments spread it into their existing config.
export const vitestExclude = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.turbo/**",
  "**/coverage/**",
  "**/playwright-report/**",
  "**/test-results/**",
  "**/src-tauri/target/**"
];
