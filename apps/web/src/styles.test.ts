import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tokensCss = readFileSync(
  resolve(here, "../../../packages/ui/src/styles/tokens.generated.css"),
  "utf8"
);
const defined = new Set(
  Array.from(tokensCss.matchAll(/(--ds-[a-z0-9-]+)\s*:/g), (match) => match[1])
);
const stylesheets = readdirSync(here, { recursive: true, encoding: "utf8" })
  .filter((path) => path.endsWith(".css"))
  .map((path) => [relative(here, join(here, path)), readFileSync(join(here, path), "utf8")]);

describe.each(stylesheets)("%s is token-only", (_path, css) => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("has no hex, rgb, hsl, or named color", () => {
    expect(body.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(body.match(/\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklch)\(/g) ?? []).toEqual([]);
    expect(
      body.match(
        /(?:color|background|border[a-z-]*|fill|stroke|outline)\s*:[^;{}]*\b(?:white|black)\b/g
      ) ?? []
    ).toEqual([]);
  });

  it("uses only design tokens that the themes define", () => {
    const used = Array.from(body.matchAll(/var\((--ds-[a-z0-9-]+)/g), (match) => match[1]);

    expect(used.filter((token) => !defined.has(token))).toEqual([]);
  });

  it("sets type through font tokens, not pixel sizes", () => {
    expect(body).not.toMatch(/font-size:\s*\d+px/);
  });
});
