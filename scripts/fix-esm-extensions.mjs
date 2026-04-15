#!/usr/bin/env node
/* global console, process */
// Adds .js extensions to relative imports/exports in compiled ESM output.
// TypeScript with moduleResolution "Bundler" emits extensionless relative
// imports, while Node ESM requires explicit extensions at runtime.

import { dirname, join } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";

const dirs = process.argv.slice(2);

if (dirs.length === 0) {
  console.error("Usage: node scripts/fix-esm-extensions.mjs <dir> [<dir> ...]");
  process.exit(1);
}

let warnings = 0;

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

const importPattern = /((?:from|import)\s*)(["'])(\.\.?\/[^"'\n]+)\2/g;

for (const dir of dirs) {
  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  for (const file of collectJsFiles(dir)) {
    const original = readFileSync(file, "utf8");
    const fileDir = dirname(file);
    const fixed = original.replace(importPattern, (match, prefix, quote, specifier) => {
      const resolved = resolveSpecifier(specifier, fileDir);

      if (resolved === null) {
        console.warn(`WARN: unresolvable specifier "${specifier}" in ${file}`);
        warnings += 1;
        return match;
      }

      if (resolved === specifier) {
        return match;
      }

      return `${prefix}${quote}${resolved}${quote}`;
    });
    const withJsonAttrs = fixed.replace(
      /(from\s*["'][^"']+\.json["'])\s*;/g,
      '$1 with { type: "json" };'
    );

    if (withJsonAttrs !== original) {
      writeFileSync(file, withJsonAttrs, "utf8");
    }
  }
}

if (warnings > 0) {
  console.error(`\n${String(warnings)} unresolvable specifier(s) found. Build failed.`);
  process.exit(1);
}

console.log("ESM extensions fixed successfully.");
