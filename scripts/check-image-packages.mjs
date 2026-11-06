#!/usr/bin/env node
/* global console, process */
// Fails an app image build when a workspace package the app imports is not in
// the image. Node finds a missing package only when the container starts, and
// a deploy that keeps the old container running hides that crash.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The file a bare import of the package loads, from its `exports` or `main`. */
function entryOf(manifest) {
  const root =
    manifest.exports && typeof manifest.exports === "object" && "." in manifest.exports
      ? manifest.exports["."]
      : manifest.exports;
  if (typeof root === "string") return root;
  const target = root?.import ?? root?.default ?? manifest.main;
  return typeof target === "string" ? target : undefined;
}

/**
 * Every `@repo/*` dependency of the app, and theirs in turn, whose entry file
 * is missing, as `name (entry)` lines.
 */
export function findMissingPackages(appDir) {
  const missing = [];
  const seen = new Set();
  const visit = (dir) => {
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      if (!name.startsWith("@repo/") || seen.has(name)) continue;
      seen.add(name);
      const packageDir = join(dir, "node_modules", name);
      const manifestPath = join(packageDir, "package.json");
      const entry = existsSync(manifestPath)
        ? entryOf(JSON.parse(readFileSync(manifestPath, "utf8")))
        : undefined;
      if (!entry || !existsSync(join(packageDir, entry))) {
        missing.push(`${name} (${entry ?? "not installed"})`);
        continue;
      }
      visit(packageDir);
    }
  };
  visit(appDir);
  return missing;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const appDir = process.argv[2];
  if (!appDir) {
    console.error("Usage: node scripts/check-image-packages.mjs <app dir>");
    process.exit(1);
  }
  const missing = findMissingPackages(appDir);
  if (missing.length > 0) {
    console.error(
      `Workspace packages missing from the image (copy their dist):\n  ${missing.join("\n  ")}`
    );
    process.exit(1);
  }
  console.log("Every workspace package of the app is in the image.");
}
