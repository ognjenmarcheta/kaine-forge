import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "globals.css"), "utf8");

function readBlock(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("\n}", start));
  return new Map(
    Array.from(body.matchAll(/(--ds-[\w-]+):\s*([^;]+);/g), (match) => [
      match[1] as string,
      (match[2] as string).trim()
    ])
  );
}

const lightTokens = readBlock(":root");
const darkTokens = new Map([...lightTokens, ...readBlock(':root[data-theme="dark"]')]);

function resolveHex(tokens: Map<string, string>, token: string): string {
  const value = tokens.get(token);
  const reference = value?.match(/^var\((--ds-[\w-]+)\)$/)?.[1];

  if (reference) {
    return resolveHex(tokens, reference);
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`${token} must resolve to an opaque #rrggbb color, got ${value}`);
  }

  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [
    number,
    number
  ];

  return (high + 0.05) / (low + 0.05);
}

// DESIGN_SYSTEM.md §12: 4.5:1 for text, 3:1 for UI graphics such as focus rings and borders.
const TEXT = 4.5;
const GRAPHIC = 3;

const pairs: [foreground: string, background: string, minimum: number][] = [
  ["--ds-text", "--ds-surface", TEXT],
  ["--ds-text", "--ds-surface-sunken", TEXT],
  ["--ds-text", "--ds-surface-raised", TEXT],
  ["--ds-text", "--ds-surface-overlay", TEXT],
  ["--ds-text-subtle", "--ds-surface", TEXT],
  ["--ds-text-subtlest", "--ds-surface", TEXT],
  ["--ds-text-subtlest", "--ds-surface-sunken", TEXT],
  ["--ds-text", "--ds-surface-sunken-bold", TEXT],
  ["--ds-text-subtlest", "--ds-surface-sunken-bold", TEXT],
  ["--ds-text-surface-inverse", "--ds-surface-inverse", TEXT],
  ["--ds-link", "--ds-surface", TEXT],
  ["--ds-text-brand", "--ds-surface", TEXT],
  ["--ds-text-selected", "--ds-background-selected", TEXT],
  ["--ds-text-brand-inverse", "--ds-background-brand-bold", TEXT],
  ["--ds-text-brand-inverse", "--ds-background-brand-bold-hovered", TEXT],
  ["--ds-text-brand-inverse", "--ds-background-brand-bold-pressed", TEXT],
  ["--ds-text-brand-inverse", "--ds-background-selected-bold", TEXT],
  ["--ds-text-inverse", "--ds-background-neutral-bold", TEXT],
  ["--ds-text-inverse", "--ds-background-success-bold", TEXT],
  ["--ds-text-inverse", "--ds-background-danger-bold", TEXT],
  ["--ds-text-inverse", "--ds-background-information-bold", TEXT],
  ["--ds-text-inverse", "--ds-background-severe-bold", TEXT],
  ["--ds-text-inverse", "--ds-background-discovery-bold", TEXT],
  ["--ds-text-warning-inverse", "--ds-background-warning-bold", TEXT],
  ["--ds-text-success", "--ds-background-success", TEXT],
  ["--ds-text-danger", "--ds-background-danger", TEXT],
  ["--ds-text-warning", "--ds-background-warning", TEXT],
  ["--ds-text-information", "--ds-background-information", TEXT],
  ["--ds-text-severe", "--ds-background-severe", TEXT],
  ["--ds-border-focused", "--ds-surface", GRAPHIC],
  ["--ds-border-bold", "--ds-surface", GRAPHIC],
  ["--ds-border-brand", "--ds-surface", GRAPHIC],
  ["--ds-icon-brand", "--ds-surface", GRAPHIC]
];

describe.each([
  ["light", lightTokens],
  ["dark", darkTokens]
])("%s theme contrast contract", (_theme, tokens) => {
  it.each(pairs)("%s on %s meets %d:1", (foreground, background, minimum) => {
    expect(
      contrast(resolveHex(tokens, foreground), resolveHex(tokens, background))
    ).toBeGreaterThanOrEqual(minimum);
  });
});
