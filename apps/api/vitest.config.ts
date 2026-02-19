import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@repo/auth": path.join(workspaceRoot, "packages/auth/src/index.ts"),
      "@repo/db": path.join(workspaceRoot, "packages/db/src/index.ts"),
      "@repo/feature-flags": path.join(workspaceRoot, "packages/feature-flags/src/index.ts"),
      "@repo/translation": path.join(workspaceRoot, "packages/translation/src/index.ts")
    }
  }
});
