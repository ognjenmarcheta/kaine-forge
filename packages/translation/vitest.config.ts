import { vitestExclude } from "@repo/config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: vitestExclude
  }
});
