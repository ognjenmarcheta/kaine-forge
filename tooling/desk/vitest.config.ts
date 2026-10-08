import { vitestExclude } from "@repo/config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: vitestExclude,
    // Many tests run real git and real child processes. Process start-up is slow on loaded
    // machines (macOS, parallel workers), so the 5 s default gives false timeouts.
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
