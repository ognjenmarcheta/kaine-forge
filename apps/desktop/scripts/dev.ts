import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

function printSetupHint() {
  console.warn("[desktop] Electron binary is missing.");
  console.warn("[desktop] Run `pnpm desktop:setup` and then retry `pnpm dev`.");
}

function resolveElectronBinary(): string | null {
  try {
    const electronPath = require("electron") as string;

    if (typeof electronPath !== "string") {
      return null;
    }

    if (!existsSync(electronPath)) {
      return null;
    }

    return electronPath;
  } catch {
    return null;
  }
}

const electronBinary = resolveElectronBinary();

if (!electronBinary) {
  printSetupHint();
  process.exit(0);
}

const desktopEntry = fileURLToPath(new URL("../dist/main/index.js", import.meta.url));

const child = spawn(electronBinary, [desktopEntry], {
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error("[desktop] Failed to launch Electron:", error);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
