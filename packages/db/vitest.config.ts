import { vitestExclude } from "@repo/config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: vitestExclude,
    // PGlite suites (with pg-boss or scrypt sign-ups) can pass vitest's 5 s test
    // and 10 s hook defaults on the slower release runner.
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
