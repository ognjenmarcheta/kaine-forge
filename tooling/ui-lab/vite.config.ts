import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Tailwind scans the source folders it saw at startup, so a screen folder added later gets no
 * CSS until a restart. This restarts the dev server when a new screen file appears.
 */
function restartOnNewScreen(): Plugin {
  return {
    name: "lab-restart-on-new-screen",
    configureServer(server) {
      server.watcher.on("add", (file) => {
        if (/[\\/]src[\\/]screens[\\/]/.test(file)) void server.restart();
      });
    }
  };
}

// The lab reads @repo/ui, @repo/ui-3d, and @repo/theme from source, so a change shows without a
// build. A subpath comes before its package: an alias also matches the paths under it.
export default defineConfig({
  plugins: [react(), tailwindcss(), restartOnNewScreen()],
  resolve: {
    alias: {
      "@repo/ui/styles/globals.css": path.join(root, "packages/ui/src/styles/globals.css"),
      "@repo/ui-3d/styles.css": path.join(root, "packages/ui-3d/src/styles.css"),
      "@repo/ui-3d/scene": path.join(root, "packages/ui-3d/src/scene.ts"),
      "@repo/ui-3d": path.join(root, "packages/ui-3d/src/index.ts"),
      "@repo/ui": path.join(root, "packages/ui/src/index.ts"),
      "@repo/theme": path.join(root, "packages/theme/src/index.ts")
    }
  },
  server: { port: 5180, strictPort: true }
});
