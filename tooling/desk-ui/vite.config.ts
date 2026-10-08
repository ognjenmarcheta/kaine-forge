import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
/** `pnpm desk:ui` proxies `/api` to a running `pnpm desk serve --port 4777`. */
const apiTarget = process.env["DESK_API_TARGET"] ?? "http://127.0.0.1:4777";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@repo/ui/styles/globals.css": path.join(root, "packages/ui/src/styles/globals.css"),
      "@repo/ui": path.join(root, "packages/ui/src/index.ts"),
      "@repo/translation": path.join(root, "packages/translation/src/index.ts")
    }
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        // The desk server accepts only its own origin on a write.
        headers: { origin: apiTarget }
      }
    }
  }
});
