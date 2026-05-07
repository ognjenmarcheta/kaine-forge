import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

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
        "@repo/auth/transport": path.join(workspaceRoot, "packages/auth/src/auth.transport.ts"),
        "@repo/auth": path.join(workspaceRoot, "packages/auth/src/index.ts"),
        "@repo/feature-flags": path.join(workspaceRoot, "packages/feature-flags/src/index.ts"),
        "@repo/persistence": path.join(workspaceRoot, "packages/persistence/src/index.ts"),
        "@repo/query": path.join(workspaceRoot, "packages/query/src/index.ts"),
        "@repo/storage": path.join(workspaceRoot, "packages/storage/src/index.ts"),
        "@repo/translation": path.join(workspaceRoot, "packages/translation/src/index.ts"),
        "@repo/ui": path.join(workspaceRoot, "packages/ui/src/index.ts")
      }
    },
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
