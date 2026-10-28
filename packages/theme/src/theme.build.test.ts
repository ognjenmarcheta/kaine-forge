import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildThemeFiles, repoRoot } from "./theme.build";

describe("generated theme files", () => {
  it("match the registered themes (run pnpm theme:build after a theme change)", async () => {
    const files = await buildThemeFiles();
    const stale = files
      .filter((file) => readFileSync(join(repoRoot, file.path), "utf8") !== file.content)
      .map((file) => file.path);

    expect(stale).toEqual([]);
  });
});
