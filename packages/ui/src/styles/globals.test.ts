import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), "globals.css");
const css = readFileSync(cssPath, "utf8");

describe("Design token coverage", () => {
  it("defines all accent color tokens for each hue", () => {
    const hues = ["blue", "teal", "green", "lime", "yellow", "orange", "red", "magenta", "purple"];
    const patterns = [
      "--ds-text-accent-{hue}",
      "--ds-text-accent-{hue}-bolder",
      "--ds-icon-accent-{hue}",
      "--ds-background-accent-{hue}-subtlest",
      "--ds-background-accent-{hue}-subtle",
      "--ds-background-accent-{hue}-bolder",
      "--ds-border-accent-{hue}"
    ];
    for (const hue of hues) {
      for (const pattern of patterns) {
        const token = pattern.replace("{hue}", hue);
        expect(css).toContain(token);
      }
    }
  });
});
