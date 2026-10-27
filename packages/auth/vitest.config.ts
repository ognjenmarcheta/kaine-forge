import { vitestExclude } from "@repo/config/vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@repo/db/client": path.join(workspaceRoot, "packages/db/src/client.ts"),
      "@repo/db/schema": path.join(workspaceRoot, "packages/db/src/schema/index.ts"),
      "@repo/db/testing": path.join(workspaceRoot, "packages/db/src/testing.ts"),
      "@repo/db": path.join(workspaceRoot, "packages/db/src/index.ts"),
      "@repo/email": path.join(workspaceRoot, "packages/email/src/index.ts"),
      "@repo/jobs/client": path.join(workspaceRoot, "packages/jobs/src/jobs.client.ts")
    }
  },
  test: {
    exclude: vitestExclude
  }
});
