/**
 * Writes the token files every app reads from the registered themes.
 *
 *   pnpm theme:build   validate the themes, then write the files
 *   pnpm theme:check   validate the themes, then fail if a written file is out of date
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildThemeFiles,
  describeDesignFindings,
  describeThemeFailures,
  repoRoot
} from "./theme.build";

const checkOnly = process.argv.includes("--check");
const failures = describeThemeFailures();

if (failures.length > 0) {
  console.error(`Theme check failed:\n${failures.map((line) => `  ${line}`).join("\n")}`);
  process.exit(1);
}

const files = await buildThemeFiles();
const findings = describeDesignFindings(files);

if (findings.length > 0) {
  console.error(`DESIGN.md lint failed:\n${findings.map((line) => `  ${line}`).join("\n")}`);
  process.exit(1);
}

const current = (path: string): string =>
  existsSync(path) ? readFileSync(path, "utf8").replaceAll("\r\n", "\n") : "";
const stale = files.filter((file) => current(join(repoRoot, file.path)) !== file.content);

if (checkOnly) {
  if (stale.length > 0) {
    console.error(
      `Theme files are out of date. Run pnpm theme:build.\n${stale.map((file) => `  ${file.path}`).join("\n")}`
    );
    process.exit(1);
  }
  console.log("Theme files are up to date.");
} else {
  for (const file of stale) {
    writeFileSync(join(repoRoot, file.path), file.content);
    console.log(`Wrote ${file.path}`);
  }
  console.log(stale.length > 0 ? "Theme files written." : "Theme files are up to date.");
}
