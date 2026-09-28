import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@repo/ui/styles/globals.css": path.join(root, "packages/ui/src/styles/globals.css"),
      "@repo/ui": path.join(root, "packages/ui/src/index.ts"),
      "@repo/translation": path.join(root, "packages/translation/src/index.ts")
    }
  }
});
