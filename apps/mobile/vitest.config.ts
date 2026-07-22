import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@repo/auth/form": path.join(workspaceRoot, "packages/auth/src/auth.form.ts"),
      "@repo/auth/session": path.join(workspaceRoot, "packages/auth/src/auth.session.ts"),
      "@repo/auth/transport": path.join(workspaceRoot, "packages/auth/src/auth.transport.ts"),
      "@repo/auth": path.join(workspaceRoot, "packages/auth/src/index.ts"),
      "@repo/logger": path.join(workspaceRoot, "packages/logger/src/index.ts"),
      "@repo/persistence": path.join(workspaceRoot, "packages/persistence/src/index.ts"),
      "@repo/query": path.join(workspaceRoot, "packages/query/src/index.ts"),
      "@repo/storage": path.join(workspaceRoot, "packages/storage/src/index.ts"),
      "@repo/todos": path.join(workspaceRoot, "packages/todos/src/index.ts"),
      "@repo/translation": path.join(workspaceRoot, "packages/translation/src/index.ts")
    }
  }
});
