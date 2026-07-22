#!/usr/bin/env node
/* global console, process */
/**
 * Sync design tokens from packages/ui globals.css into
 * apps/mobile/src/styles/global.css (:root and .dark blocks).
 *
 * Canonical source: packages/ui/src/styles/globals.css
 * Generated region is bounded by DESIGN_TOKENS_START / DESIGN_TOKENS_END.
 * Functional color tokens are resolved to concrete values (NativeWind does not
 * chase nested var() chains the way web CSS does).
 *
 * Usage:
 *   node scripts/sync-mobile-design-tokens.mjs           # write mobile CSS
 *   node scripts/sync-mobile-design-tokens.mjs --check    # exit 1 on drift
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webCssPath = join(root, "packages/ui/src/styles/globals.css");
const mobileCssPath = join(root, "apps/mobile/src/styles/global.css");

const checkOnly = process.argv.includes("--check");

const START = "/* DESIGN_TOKENS_START */";
const END = "/* DESIGN_TOKENS_END */";

/** Theme-independent structural tokens kept on mobile :root only. */
const STRUCTURAL_PREFIXES = [
  "--ds-space-",
  "--ds-radius-",
  "--ds-font-weight-",
  "--ds-lineHeight-",
  "--ds-border-width",
  "--ds-control-"
];

/** Functional / semantic tokens resolved for light + dark. */
const FUNCTIONAL_PREFIXES = [
  "--ds-text",
  "--ds-link",
  "--ds-background-",
  "--ds-surface",
  "--ds-border",
  "--ds-shadow-",
  "--ds-blanket"
];

function extractBlock(css, headerPattern) {
  const match = css.match(headerPattern);
  if (!match || match.index === undefined) {
    throw new Error(`block not found: ${headerPattern}`);
  }
  const start = match.index + match[0].length;
  let depth = 1;
  let i = start;
  while (i < css.length && depth > 0) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") depth -= 1;
    i += 1;
  }
  return css.slice(start, i - 1);
}

function parseVars(block) {
  const vars = new Map();
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*(--ds-[^:]+):\s*([^;]+);/);
    if (m) {
      vars.set(m[1].trim(), m[2].trim());
    }
  }
  return vars;
}

function resolveValue(value, scope, base) {
  let current = value;
  for (let n = 0; n < 8; n += 1) {
    const ref = current.match(/^var\((--ds-[^)]+)\)$/);
    if (!ref) {
      return current;
    }
    const key = ref[1];
    const next = scope.get(key) ?? base.get(key);
    if (!next) {
      return current;
    }
    current = next;
  }
  return current;
}

function startsWithAny(key, prefixes) {
  return prefixes.some((p) => key === p || key.startsWith(p));
}

function isFunctional(key) {
  if (key.includes("-base-")) return false;
  return startsWithAny(key, FUNCTIONAL_PREFIXES);
}

function isStructural(key) {
  if (key.includes("-base-")) return false;
  return startsWithAny(key, STRUCTURAL_PREFIXES);
}

function formatBlock(selector, entries) {
  const lines = entries.map(([key, value]) => `  ${key}: ${value};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

function sortedEntries(map) {
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const webCss = readFileSync(webCssPath, "utf8");
const rootBlock = extractBlock(webCss, /:root\s*\{/);
const darkBlock = extractBlock(webCss, /:root\[data-theme="dark"\]\s*\{/);

const rootVars = parseVars(rootBlock);
const darkVars = parseVars(darkBlock);

const baseLight = new Map([...rootVars.entries()].filter(([k]) => k.includes("-base-light-")));
const baseDark = new Map([...rootVars.entries()].filter(([k]) => k.includes("-base-dark-")));

const lightFunctional = new Map();
const lightStructural = new Map();
const darkFunctional = new Map();

for (const [key, value] of rootVars) {
  if (isFunctional(key)) {
    lightFunctional.set(key, resolveValue(value, rootVars, baseLight));
  } else if (isStructural(key)) {
    // Structural values are already concrete (rem/px/number).
    lightStructural.set(key, resolveValue(value, rootVars, baseLight));
  }
}

for (const [key, value] of darkVars) {
  if (isFunctional(key)) {
    darkFunctional.set(key, resolveValue(value, darkVars, baseDark));
  }
}

// :root gets structural + light functional; .dark gets dark functional only.
const rootEntries = sortedEntries(new Map([...lightStructural, ...lightFunctional]));
const darkEntries = sortedEntries(darkFunctional);

const lightBlock = formatBlock(":root", rootEntries);
const darkBlockOut = formatBlock(".dark", darkEntries);
const generated = `${START}\n${lightBlock}\n\n${darkBlockOut}\n${END}`;

const mobileCss = readFileSync(mobileCssPath, "utf8");

let nextMobile;
if (mobileCss.includes(START) && mobileCss.includes(END)) {
  // Replace generated region; strip any leftover hand-written :root / .dark outside it.
  const withTokens = mobileCss.replace(new RegExp(`${START}[\\s\\S]*?${END}`), generated);
  const before = withTokens.slice(0, withTokens.indexOf(START));
  const after = withTokens.slice(withTokens.indexOf(END) + END.length);
  const cleanedAfter = after
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => (comment.includes("DESIGN_TOKENS") ? comment : ""))
    .replace(/(^|\n)\s*:root\s*\{[\s\S]*?\n\}/g, "\n")
    .replace(/(^|\n)\s*\.dark\s*\{[\s\S]*?\n\}/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  nextMobile = `${before.trimEnd()}\n\n${generated}${cleanedAfter ? `\n\n${cleanedAfter.trimStart()}` : "\n"}`;
} else {
  const marker = "@tailwind utilities;";
  if (!mobileCss.includes(marker)) {
    throw new Error("mobile global.css missing @tailwind utilities; marker");
  }
  // First-time: keep only tailwind directives + generated tokens.
  nextMobile = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n${generated}\n`;
}

if (checkOnly) {
  if (nextMobile !== mobileCss) {
    console.error("Mobile design tokens are out of sync with packages/ui globals.css");
    console.error("Run: node scripts/sync-mobile-design-tokens.mjs");
    process.exit(1);
  }
  console.log("Mobile design tokens match web source.");
  process.exit(0);
}

writeFileSync(mobileCssPath, nextMobile);
console.log(`Wrote functional tokens to ${mobileCssPath}`);
