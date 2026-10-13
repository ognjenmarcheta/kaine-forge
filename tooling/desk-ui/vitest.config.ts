import { vitestExclude } from "@repo/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

// Keep the aliases and plugins of vite.config.ts and add the shared exclude list on top.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.{ts,tsx}"],
      exclude: vitestExclude,
      environment: "jsdom",
      // A test here can wait more than once at the `waitFor` budget of test.setup.ts.
      testTimeout: 15_000,
      setupFiles: ["./src/test/test.setup.ts"]
    }
  })
);
