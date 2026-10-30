import { vitestExclude } from "@repo/config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: vitestExclude,
    // The build test formats every generated theme file with a cold Prettier, which
    // can pass vitest's 5 s default on the slower release runner.
    testTimeout: 30_000
  }
});
