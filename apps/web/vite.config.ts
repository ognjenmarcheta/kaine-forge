import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:4000";
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@repo/auth": path.join(workspaceRoot, "packages/auth/src/index.ts"),
      "@repo/feature-flags": path.join(workspaceRoot, "packages/feature-flags/src/index.ts"),
      "@repo/query": path.join(workspaceRoot, "packages/query/src/index.ts"),
      "@repo/translation": path.join(workspaceRoot, "packages/translation/src/index.ts"),
      "@repo/ui": path.join(workspaceRoot, "packages/ui/src/index.ts")
    }
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: apiProxyTarget
      },
      "/graphql": {
        target: apiProxyTarget
      }
    }
  }
});
