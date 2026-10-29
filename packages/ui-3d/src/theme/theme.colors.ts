/** A `--ds-*` custom property whose value is a color, such as `--ds-background-selected-bold`. */
export type ThemeColorToken = `--ds-${string}`;

/** A resolved token: the sRGB color as 0xrrggbb, and its alpha as a separate opacity. */
export interface TokenColor {
  readonly rgb: number;
  readonly opacity: number;
}

const HEX_COLOR = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i;

/**
 * Reads a resolved token value. Themes emit hex colors. An eight-digit hex carries alpha, and
 * alpha must become the material's opacity: folded into the color, it would darken the color
 * instead of letting the scene show through. Returns null for a value that is not a hex color,
 * such as the empty string of an undefined token.
 */
export function parseTokenColor(value: string): TokenColor | null {
  const match = HEX_COLOR.exec(value.trim());
  const rgb = match?.[1];
  if (rgb === undefined) return null;
  const alpha = match?.[2];
  return {
    rgb: Number.parseInt(rgb, 16),
    opacity: alpha === undefined ? 1 : Number.parseInt(alpha, 16) / 255
  };
}

/**
 * Reads tokens as an element sees them. Custom properties inherit, so a theme set on any
 * ancestor applies. Throws for a token that is not a hex color, so a typo fails loudly in the
 * viewer's error boundary instead of drawing black.
 */
export function readTokenColors<Key extends string>(
  element: Element,
  tokens: Readonly<Record<Key, ThemeColorToken>>
): Record<Key, TokenColor> {
  const style = getComputedStyle(element);
  return mapTokens(tokens, (token) => {
    const value = style.getPropertyValue(token);
    const color = parseTokenColor(value);
    if (!color) throw new Error(`${token} is not a hex color theme token (read "${value}")`);
    return color;
  });
}

/** Builds one value per token key. */
export function mapTokens<Key extends string, Value>(
  tokens: Readonly<Record<Key, ThemeColorToken>>,
  build: (token: ThemeColorToken, key: Key) => Value
): Record<Key, Value> {
  const entries = Object.entries<ThemeColorToken>(tokens).map(([key, token]) => [
    key,
    // SAFETY: every key of `tokens` is a Key; Object.entries only widens it to string.
    build(token, key as Key)
  ]);
  // SAFETY: the entries hold exactly one value for each key of `tokens`.
  return Object.fromEntries(entries) as Record<Key, Value>;
}
