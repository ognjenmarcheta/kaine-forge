export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
}

const HEX = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i;

/** Parses #rrggbb or #rrggbbaa into channels from 0 to 1. */
export function parseHex(hex: string): Rgba {
  const match = HEX.exec(hex);
  const rgb = match?.[1];

  if (!rgb) {
    throw new Error(`Expected a #rrggbb or #rrggbbaa color, got "${hex}"`);
  }

  const channel = (value: string): number => Number.parseInt(value, 16) / 255;

  return {
    r: channel(rgb.slice(0, 2)),
    g: channel(rgb.slice(2, 4)),
    b: channel(rgb.slice(4, 6)),
    alpha: match[2] ? channel(match[2]) : 1
  };
}

/** Paints a translucent color over an opaque background. */
function composite(color: Rgba, background: Rgba): Rgba {
  const mix = (top: number, bottom: number): number =>
    top * color.alpha + bottom * (1 - color.alpha);

  return {
    r: mix(color.r, background.r),
    g: mix(color.g, background.g),
    b: mix(color.b, background.b),
    alpha: 1
  };
}

function relativeLuminance({ r, g, b }: Rgba): number {
  const linear = (channel: number): number =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * WCAG 2.2 contrast ratio. A translucent foreground or background is first painted
 * over `backdrop`, the surface it sits on.
 */
export function contrastRatio(foreground: string, background: string, backdrop: string): number {
  const base = parseHex(backdrop);
  const bottom = composite(parseHex(background), base);
  const top = composite(parseHex(foreground), bottom);
  const luminances = [relativeLuminance(top), relativeLuminance(bottom)];
  const high = Math.max(...luminances);
  const low = Math.min(...luminances);

  return (high + 0.05) / (low + 0.05);
}
