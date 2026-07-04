import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@repo/auth/auth.definition": path.join(
        workspaceRoot,
        "packages/auth/src/auth.definition.ts"
      ),
      "@repo/auth/scope": path.join(workspaceRoot, "packages/auth/src/auth.scope.ts"),
      "@repo/auth/auth.type": path.join(workspaceRoot, "packages/auth/src/auth.type.ts"),
      "@repo/auth/auth.util": path.join(workspaceRoot, "packages/auth/src/auth.util.ts"),
      "@repo/auth/server": path.join(workspaceRoot, "packages/auth/src/auth.server.ts"),
      "@repo/db/client": path.join(workspaceRoot, "packages/db/src/client.ts"),
      "@repo/db": path.join(workspaceRoot, "packages/db/src/index.ts"),
      "@repo/email": path.join(workspaceRoot, "packages/email/src/index.ts"),
      "@repo/feature-flags": path.join(workspaceRoot, "packages/feature-flags/src/index.ts"),
      "@repo/storage": path.join(workspaceRoot, "packages/storage/src/index.ts"),
      "@repo/translation": path.join(workspaceRoot, "packages/translation/src/index.ts")
    }
  }
});
