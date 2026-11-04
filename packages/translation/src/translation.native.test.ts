import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildNativeLocaleFiles, nativeKeys, repoRoot, toRustI18n } from "./translation.native";

describe("native desktop locale files", () => {
  it("match the keys the Rust sources use (run pnpm translation:build after a t! change)", async () => {
    const files = await buildNativeLocaleFiles();
    const stale = files
      .filter((file) => readFileSync(join(repoRoot, file.path), "utf8") !== file.content)
      .map((file) => file.path);

    expect(files.length).toBeGreaterThan(0);
    expect(stale).toEqual([]);
  });

  it("collects every whole key passed to t!, once", () => {
    const source =
      't!("auth.login.title")\n  t!( "common.appName", name = x)\n t!("common.appName")\n t!(key)';
    expect(nativeKeys(source)).toEqual(["auth.login.title", "common.appName"]);
  });

  it("converts i18next placeholders to rust-i18n placeholders", () => {
    expect(toRustI18n("Hello {{name}}, {{ count }} left")).toBe("Hello %{name}, %{count} left");
  });
});
