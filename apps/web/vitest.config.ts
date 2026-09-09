import { vitestExclude } from "@repo/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

// Vitest used vite.config.ts by fallback; keep its aliases and plugins and add
// the shared exclude list on top.
export default defineConfig(async (env) => {
  const base = typeof viteConfig === "function" ? await viteConfig(env) : await viteConfig;
  return mergeConfig(base, { test: { exclude: vitestExclude } });
});
