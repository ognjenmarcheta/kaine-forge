import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(import.meta.dirname, "desk.styles.css"), "utf8");
const tokensCss = readFileSync(
  path.resolve(import.meta.dirname, "../../../packages/ui/src/styles/globals.css"),
  "utf8"
);

const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "");
const body = stripComments(css);

describe("desk.styles.css is token-only", () => {
  it("has no hex, rgb, hsl, or named color", () => {
    expect(body.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(body.match(/\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklch)\(/g) ?? []).toEqual([]);
    const declarations =
      body.match(/(?:color|background|border[a-z-]*|fill|stroke|outline)\s*:[^;{}]+/g) ?? [];
    const named = declarations.filter((line) =>
      /(?:^|[\s:])(?:white|black|red|green|blue|gray|grey|orange|yellow|purple)\b/.test(line)
    );
    expect(named).toEqual([]);
  });

  it("uses only design tokens that the design system defines", () => {
    const defined = new Set([...tokensCss.matchAll(/(--ds-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const local = new Set([...body.matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]));
    const used = [...body.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1] ?? "");
    const unknown = used.filter(
      (name) => !defined.has(name) && !local.has(name) && !name.startsWith("--xy-")
    );
    expect([...new Set(unknown)]).toEqual([]);
  });

  it("has no pixel size except hairlines", () => {
    expect(body.match(/\b\d+px\b/g) ?? []).toEqual([]);
  });

  it("defines a tone for every status role the graph uses", () => {
    for (const tone of [
      "information",
      "warning",
      "warning-subtle",
      "success",
      "danger",
      "neutral"
    ]) {
      expect(css).toContain(`.desk-tone--${tone} {`);
    }
  });

  it("turns the moving edge off for people who ask for less motion", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  });
});
