/**
 * Writes the rust-i18n locale files the native desktop app reads (apps/desktop-native/locales).
 *
 *   pnpm translation:build   write the files from the keys the Rust sources use
 *   pnpm translation:check   fail if a written file is out of date or a key is missing
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildNativeLocaleFiles, repoRoot } from "./translation.native";

const checkOnly = process.argv.includes("--check");
const files = await buildNativeLocaleFiles();
const current = (path: string): string =>
  existsSync(path) ? readFileSync(path, "utf8").replaceAll("\r\n", "\n") : "";
const stale = files.filter((file) => current(join(repoRoot, file.path)) !== file.content);

if (checkOnly) {
  if (stale.length > 0) {
    console.error(
      `Native locale files are out of date. Run pnpm translation:build.\n${stale.map((file) => `  ${file.path}`).join("\n")}`
    );
    process.exit(1);
  }
  console.log("Native locale files are up to date.");
} else {
  for (const file of stale) {
    writeFileSync(join(repoRoot, file.path), file.content);
    console.log(`Wrote ${file.path}`);
  }
  console.log(
    stale.length > 0 ? "Native locale files written." : "Native locale files are up to date."
  );
}
