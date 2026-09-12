import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("installed native drawer motion contract", () => {
  it("uses system reduced motion in both Metro source and the compiled module", () => {
    const require = createRequire(import.meta.url);
    const navigationRequire = createRequire(require.resolve("@react-navigation/drawer"));
    const moduleDirectory = dirname(navigationRequire.resolve("react-native-drawer-layout"));
    for (const path of ["views/Drawer.native.js", "../../src/views/Drawer.native.tsx"]) {
      const source = readFileSync(resolve(moduleDirectory, path), "utf8");
      expect(source).toContain("reduceMotion: ReduceMotion.System");
      expect(source).not.toContain("reduceMotion: ReduceMotion.Never");
      expect(source).toContain("overshootClamping: true");
    }
  });
});
