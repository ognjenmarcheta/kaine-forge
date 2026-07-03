import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "globals.css"), "utf8");
const designSystemDoc = readFileSync(resolve(here, "../../../../DESIGN_SYSTEM.md"), "utf8");
const tailwindPreset = readFileSync(resolve(here, "../../../config/tailwind/preset.js"), "utf8");

// DESIGN_SYSTEM.md §3.1 component-tier example; no component tokens exist yet,
// so it stays illustrative and is exempt from the contract.
const ILLUSTRATIVE_TOKENS = new Set(["--ds-button-brand-bg-hovered"]);

function extractTokens(source: string, pattern: RegExp): Set<string> {
  return new Set(Array.from(source.matchAll(pattern), (match) => match[1] as string));
}

const definedTokens = extractTokens(css, /(--ds-[a-zA-Z0-9-]*[a-zA-Z0-9])\s*:/g);
const documentedTokens = extractTokens(designSystemDoc, /(--ds-[a-zA-Z0-9-]*[a-zA-Z0-9])/g);
const presetReferencedTokens = extractTokens(
  tailwindPreset,
  /var\((--ds-[a-zA-Z0-9-]*[a-zA-Z0-9])/g
);

// A documented prefix such as --ds-breakpoint (written --ds-breakpoint-* in the
// doc) is covered when any concrete token extends it.
function isCovered(token: string): boolean {
  if (definedTokens.has(token)) {
    return true;
  }

  const prefix = `${token}-`;

  for (const defined of definedTokens) {
    if (defined.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

describe("design token contract", () => {
  it("defines every token or token prefix documented in DESIGN_SYSTEM.md", () => {
    const missing = [...documentedTokens].filter(
      (token) => !ILLUSTRATIVE_TOKENS.has(token) && !isCovered(token)
    );

    expect(missing).toEqual([]);
  });

  it("defines every token referenced by the Tailwind preset", () => {
    const missing = [...presetReferencedTokens].filter((token) => !definedTokens.has(token));

    expect(missing).toEqual([]);
  });

  it("keeps the illustrative-token allowlist minimal and honest", () => {
    for (const token of ILLUSTRATIVE_TOKENS) {
      expect(documentedTokens.has(token)).toBe(true);
      expect(isCovered(token)).toBe(false);
    }
  });
});
