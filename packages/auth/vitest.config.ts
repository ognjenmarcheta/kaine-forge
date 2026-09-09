import { vitestExclude } from "@repo/config/vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@repo/db": path.join(workspaceRoot, "packages/db/src/index.ts"),
      "@repo/email": path.join(workspaceRoot, "packages/email/src/index.ts")
    }
  },
  test: {
    exclude: vitestExclude
  }
});
