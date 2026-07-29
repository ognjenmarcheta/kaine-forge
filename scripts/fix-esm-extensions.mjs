#!/usr/bin/env node
/* global console, process */
// Adds .js extensions to relative imports/exports in compiled ESM output.
// TypeScript with moduleResolution "Bundler" emits extensionless relative
// imports, while Node ESM requires explicit extensions at runtime.

import { dirname, join } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function collectJsFiles(dir) {
  const results = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);

    if (statSync(fullPath).isDirectory()) {
      results.push(...collectJsFiles(fullPath));
      continue;
    }

    if (entry.endsWith(".js")) {
      results.push(fullPath);
    }
  }

  return results;
}

function resolveSpecifier(specifier, fileDir) {
  if (/\.(cjs|js|json|mjs)$/.test(specifier)) {
    return specifier;
  }

  const absTarget = join(fileDir, specifier);

  if (existsSync(`${absTarget}.js`)) {
    return `${specifier}.js`;
  }

  if (existsSync(join(absTarget, "index.js"))) {
    return `${specifier}/index.js`;
  }

  return null;
}

// Static: `from "./x"` / `import "./x"`. Dynamic: `import("./x")` (no space after
// import). TypeScript "Bundler" resolution emits both forms without extensions;
// Node ESM needs the `.js` suffix for both.
const staticImportPattern = /((?:from|import)\s*)(["'])(\.\.?\/[^"'\n]+)\2/g;
const dynamicImportPattern = /\bimport\s*\(\s*(["'])(\.\.?\/[^"'\n]+)\1\s*\)/g;

/**
 * Rewrite extensionless relative imports/exports in one compiled ESM file body.
 * Returns the fixed source and how many unresolvable relative specifiers remain.
 *
 * @param {string} original
 * @param {string} fileDir Absolute directory of the file being rewritten (for existsSync).
 * @param {{ warn?: (message: string) => void }} [options]
 */
export function fixEsmExtensionsInSource(original, fileDir, options = {}) {
  const warn = options.warn ?? ((message) => console.warn(message));
  let localWarnings = 0;

  const rewrite = (specifier) => {
    const resolved = resolveSpecifier(specifier, fileDir);
    if (resolved === null) {
      localWarnings += 1;
      return null;
    }
    return resolved;
  };

  // Dynamic imports first so they are not partially matched by the static form.
  let fixed = original.replace(dynamicImportPattern, (match, quote, specifier) => {
    const resolved = rewrite(specifier);
    if (resolved === null) {
      warn(`WARN: unresolvable specifier "${specifier}" in dynamic import`);
      return match;
    }
    if (resolved === specifier) {
      return match;
    }
    return `import(${quote}${resolved}${quote})`;
  });

  fixed = fixed.replace(staticImportPattern, (match, prefix, quote, specifier) => {
    const resolved = rewrite(specifier);
    if (resolved === null) {
      warn(`WARN: unresolvable specifier "${specifier}"`);
      return match;
    }
    if (resolved === specifier) {
      return match;
    }
    return `${prefix}${quote}${resolved}${quote}`;
  });

  fixed = fixed.replace(/(from\s*["'][^"']+\.json["'])\s*;/g, '$1 with { type: "json" };');

  return { fixed, warnings: localWarnings };
}

export function fixEsmExtensionsInDirs(dirs, options = {}) {
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  let warnings = 0;

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      error(`Directory not found: ${dir}`);
      return { ok: false, warnings, exitCode: 1 };
    }

    for (const file of collectJsFiles(dir)) {
      const original = readFileSync(file, "utf8");
      const fileDir = dirname(file);
      const { fixed, warnings: fileWarnings } = fixEsmExtensionsInSource(original, fileDir, {
        warn: (message) => error(`${message} in ${file}`)
      });
      warnings += fileWarnings;

      if (fixed !== original) {
        writeFileSync(file, fixed, "utf8");
      }
    }
  }

  if (warnings > 0) {
    error(`\n${String(warnings)} unresolvable specifier(s) found. Build failed.`);
    return { ok: false, warnings, exitCode: 1 };
  }

  log("ESM extensions fixed successfully.");
  return { ok: true, warnings: 0, exitCode: 0 };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const dirs = process.argv.slice(2);

  if (dirs.length === 0) {
    console.error("Usage: node scripts/fix-esm-extensions.mjs <dir> [<dir> ...]");
    process.exit(1);
  }

  const result = fixEsmExtensionsInDirs(dirs);
  process.exit(result.exitCode);
}
