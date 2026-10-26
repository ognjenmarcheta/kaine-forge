import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const appRoot = fileURLToPath(new URL(".", import.meta.url));
// The CI PR e2e job serves this build through `vite preview`, so Build Core sets
// E2E_FIXTURES=true to add the dev-only Playwright fixture page. The shipped build
// (Dockerfile.web, Release) does not set it and contains index.html only.
const e2eFixtures = process.env["E2E_FIXTURES"] === "true";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, "VITE_");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET ?? "http://localhost:4000";

  return {
    envDir: workspaceRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@repo/ui/styles/globals.css": path.join(
          workspaceRoot,
          "packages/ui/src/styles/globals.css"
        ),
        "@repo/auth/form": path.join(workspaceRoot, "packages/auth/src/auth.form.ts"),
        "@repo/auth/transport": path.join(workspaceRoot, "packages/auth/src/auth.transport.ts"),
        "@repo/auth/session": path.join(workspaceRoot, "packages/auth/src/auth.session.ts"),
        "@repo/auth/permissions": path.join(workspaceRoot, "packages/auth/src/auth.permissions.ts"),
        "@repo/auth": path.join(workspaceRoot, "packages/auth/src/index.ts"),
        "@repo/feature-flags": path.join(workspaceRoot, "packages/feature-flags/src/index.ts"),
        "@repo/persistence": path.join(workspaceRoot, "packages/persistence/src/index.ts"),
        "@repo/query": path.join(workspaceRoot, "packages/query/src/index.ts"),
        "@repo/storage/client": path.join(workspaceRoot, "packages/storage/src/client.ts"),
        "@repo/storage": path.join(workspaceRoot, "packages/storage/src/index.ts"),
        "@repo/todos": path.join(workspaceRoot, "packages/todos/src/index.ts"),
        "@repo/translation": path.join(workspaceRoot, "packages/translation/src/index.ts"),
        "@repo/ui": path.join(workspaceRoot, "packages/ui/src/index.ts")
      }
    },
    ...(e2eFixtures
      ? {
          build: {
            rolldownOptions: {
              input: {
                main: path.join(appRoot, "index.html"),
                motion: path.join(appRoot, "motion.fixture.html")
              }
            }
          }
        }
      : {}),
    server: {
      port: 3000,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false
        },
        "/graphql": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          ws: true
        }
      }
    }
  };
});
