import { vitestExclude } from "@repo/config/vitest";
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
      "@repo/auth/audit.definition": path.join(
        workspaceRoot,
        "packages/auth/src/auth.audit.definition.ts"
      ),
      "@repo/auth/audit": path.join(workspaceRoot, "packages/auth/src/auth.audit.ts"),
      "@repo/auth/billing": path.join(workspaceRoot, "packages/auth/src/auth.billing.ts"),
      "@repo/auth/notifications": path.join(
        workspaceRoot,
        "packages/auth/src/auth.notification.ts"
      ),
      "@repo/auth/permissions": path.join(workspaceRoot, "packages/auth/src/auth.permissions.ts"),
      "@repo/auth/scope": path.join(workspaceRoot, "packages/auth/src/auth.scope.ts"),
      "@repo/auth/auth.type": path.join(workspaceRoot, "packages/auth/src/auth.type.ts"),
      "@repo/auth/auth.util": path.join(workspaceRoot, "packages/auth/src/auth.util.ts"),
      "@repo/auth/instance": path.join(workspaceRoot, "packages/auth/src/auth.instance.ts"),
      "@repo/auth/server": path.join(workspaceRoot, "packages/auth/src/auth.server.ts"),
      "@repo/billing": path.join(workspaceRoot, "packages/billing/src/index.ts"),
      "@repo/db/client": path.join(workspaceRoot, "packages/db/src/client.ts"),
      "@repo/db/schema": path.join(workspaceRoot, "packages/db/src/schema/index.ts"),
      "@repo/db/testing": path.join(workspaceRoot, "packages/db/src/testing.ts"),
      "@repo/db/types": path.join(workspaceRoot, "packages/db/src/types/index.ts"),
      "@repo/db": path.join(workspaceRoot, "packages/db/src/index.ts"),
      "@repo/email": path.join(workspaceRoot, "packages/email/src/index.ts"),
      "@repo/jobs/client": path.join(workspaceRoot, "packages/jobs/src/jobs.client.ts"),
      "@repo/jobs": path.join(workspaceRoot, "packages/jobs/src/index.ts"),
      "@repo/feature-flags": path.join(workspaceRoot, "packages/feature-flags/src/index.ts"),
      "@repo/logger": path.join(workspaceRoot, "packages/logger/src/index.ts"),
      "@repo/storage": path.join(workspaceRoot, "packages/storage/src/index.ts"),
      "@repo/translation": path.join(workspaceRoot, "packages/translation/src/index.ts")
    }
  },
  test: {
    exclude: vitestExclude,
    // PGlite suites (with pg-boss or scrypt sign-ups) can pass vitest's 5 s test
    // and 10 s hook defaults on the slower release runner.
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
