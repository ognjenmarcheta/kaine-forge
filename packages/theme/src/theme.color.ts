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

/** The opaque #rrggbb that a translucent color shows over an opaque backdrop. */
export function flatten(color: string, backdrop: string): string {
  const { r, g, b } = composite(parseHex(color), parseHex(backdrop));
  const hex = (channel: number): string =>
    Math.round(channel * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${hex(r)}${hex(g)}${hex(b)}`;
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

export interface Oklch {
  /** Perceptual lightness from 0 to 1. */
  readonly l: number;
  readonly c: number;
  /** Hue in degrees. */
  readonly h: number;
}

const linearize = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const gammaEncode = (channel: number): number =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

export function toOklch(hex: string): Oklch {
  const { r, g, b } = parseHex(hex);
  const [lr, lg, lb] = [linearize(r), linearize(g), linearize(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const labA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(labB, labA) * 180) / Math.PI;

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    c: Math.hypot(labA, labB),
    h: hue < 0 ? hue + 360 : hue
  };
}

function oklchToLinear({ l: lightness, c, h }: Oklch): [number, number, number] {
  const radians = (h * Math.PI) / 180;
  const labA = c * Math.cos(radians);
  const labB = c * Math.sin(radians);
  const l = (lightness + 0.3963377774 * labA + 0.2158037573 * labB) ** 3;
  const m = (lightness - 0.1055613458 * labA - 0.0638541728 * labB) ** 3;
  const s = (lightness - 0.0894841775 * labA - 1.291485548 * labB) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
}

const inGamut = (channels: readonly number[]): boolean =>
  channels.every((channel) => channel >= -1e-6 && channel <= 1 + 1e-6);

/** Converts to #rrggbb. Out-of-gamut colors keep their lightness and hue and lose chroma. */
export function fromOklch(color: Oklch): string {
  const l = Math.min(1, Math.max(0, color.l));
  let low = 0;
  let high = color.c;

  if (!inGamut(oklchToLinear({ ...color, l }))) {
    for (let step = 0; step < 24; step += 1) {
      const middle = (low + high) / 2;
      if (inGamut(oklchToLinear({ ...color, l, c: middle }))) low = middle;
      else high = middle;
    }
    high = low;
  }

  const hex = (channel: number): string =>
    Math.round(Math.min(1, Math.max(0, gammaEncode(channel))) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${oklchToLinear({ ...color, l, c: high })
    .map(hex)
    .join("")}`;
}

/** Appends an alpha channel from 0 to 1 to an opaque #rrggbb color. */
export function withAlpha(hex: string, alpha: number): string {
  return `${hex.slice(0, 7)}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

/** Shifts OKLCH lightness by `delta`, keeping hue and chroma. */
export function shiftLightness(hex: string, delta: number): string {
  const color = toOklch(hex);

  return fromOklch({ ...color, l: color.l + delta });
}

/**
 * The nearest color to `color` that reaches `minimum` against `background`: it moves the
 * OKLCH lightness away from the background and keeps the hue. A passing color comes back as is.
 * A translucent background is measured over `backdrop`; without one, its alpha is dropped.
 */
export function ensureContrast(
  color: string,
  background: string,
  minimum: number,
  backdrop?: string
): string {
  const fill = backdrop === undefined ? background.slice(0, 7) : background;
  const base = backdrop ?? fill;
  const start = toOklch(color);
  const direction = start.l >= toOklch(flatten(fill, base)).l ? 1 : -1;
  let candidate = color.slice(0, 7);

  for (let step = 0; step <= 200; step += 1) {
    candidate = fromOklch({ ...start, l: start.l + direction * step * 0.005 });
    if (contrastRatio(candidate, fill, base) >= minimum) {
      return candidate;
    }
  }

  return candidate;
}
