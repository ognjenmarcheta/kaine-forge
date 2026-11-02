import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const here = fileURLToPath(new URL(".", import.meta.url));
/** `pnpm desk:ui` proxies `/api` to a running `pnpm desk serve --port 4777`. */
const apiTarget = process.env["DESK_API_TARGET"] ?? "http://127.0.0.1:4777";

/**
 * Tailwind scans the source folders it saw at startup, so a lab screen added later gets no CSS
 * until a restart. This restarts the dev server when a new `*.screen.tsx` appears. Other new
 * files in a screen folder reach Tailwind through the screen's imports, so they need no restart,
 * which matters when several agents add files at once.
 */
function restartOnNewScreen(): Plugin {
  return {
    name: "lab-restart-on-new-screen",
    configureServer(server) {
      server.watcher.on("add", (file) => {
        if (/[\\/]src[\\/]lab[\\/]screens[\\/][^\\/]+[\\/][^\\/]+\.screen\.tsx$/.test(file)) {
          void server.restart();
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), restartOnNewScreen()],
  resolve: {
    alias: {
      "@repo/ui/styles/globals.css": path.join(root, "packages/ui/src/styles/globals.css"),
      "@repo/ui": path.join(root, "packages/ui/src/index.ts"),
      "@repo/theme": path.join(root, "packages/theme/src/index.ts"),
      "@repo/translation": path.join(root, "packages/translation/src/index.ts")
    }
  },
  build: {
    rolldownOptions: {
      // The desk, and the lab frame: one lab screen alone, which the compare view frames and the
      // lab scripts screenshot.
      input: {
        desk: path.join(here, "index.html"),
        labFrame: path.join(here, "lab-frame.html")
      }
    }
  },
  server: {
    port: 5174,
    strictPort: true,
    // No error overlay: a lab screen that does not compile shows as "did not load" in the lab,
    // and the overlay would cover every other screen and its lab:shots and lab:diff images.
    hmr: { overlay: false },
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
