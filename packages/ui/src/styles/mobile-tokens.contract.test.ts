import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const syncScript = resolve(repoRoot, "scripts/sync-mobile-design-tokens.mjs");

describe("mobile design token sync contract", () => {
  it("keeps apps/mobile global.css in sync with packages/ui globals.css", () => {
    expect(() => {
      execFileSync(process.execPath, [syncScript, "--check"], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
    }).not.toThrow();
  });
});
