# Create a theme

A theme is a named identity: colors in light and dark, type, shape, density, depth, and motion. Every theme goes through the same path as the default theme, Byte Forge. Moss (`packages/theme/src/themes/moss/`) is a complete example that changes every axis.

You need about 30 lines of TypeScript and a short `DESIGN.md`. The tools derive the rest and check it.

## 1. Decide the axes

Write one line for each axis before you write code.

| Axis    | What you choose                                                 | Moss                             |
| ------- | --------------------------------------------------------------- | -------------------------------- |
| Color   | a brand color and a neutral tint                                | `#2f6b4f`, warm stone            |
| Type    | sans, heading, and mono font stacks, and the heading weight     | system sans, serif headings, 600 |
| Shape   | the radius of buttons, fields, cards, overlays, dialogs, badges | 4–8px                            |
| Density | `compact`, `default`, or `comfortable`                          | compact                          |
| Depth   | `shadow` (soft card shadows) or `border` (flat cards)           | border                           |
| Motion  | durations and easing, only if the defaults do not fit           | defaults                         |

## 2. Write the theme file

Create `packages/theme/src/themes/<name>/<name>.theme.ts`. Use a lowercase kebab-case name; it is stored per Organization and written to the page as `data-theme`.

```ts
import { createTheme } from "../../theme.create";

export const harborTheme = createTheme({
  name: "harbor",
  label: "Harbor",
  description: "Deep navy actions on cool paper, rounded and roomy.",
  color: { brand: "#1f4e8c", neutral: { hue: 250, chroma: 0.01 } },
  fonts: { heading: '"Fraunces Variable", ui-serif, Georgia, serif' },
  nativeFonts: { heading: "system-serif" },
  headingWeight: 600,
  density: "comfortable",
  depth: "shadow",
  components: { "button-radius": "10px", "card-radius": "16px" }
});
```

`createTheme` starts from the template scales and derives every color role for light and dark from the brand color and the neutral tint. It places each role on a lightness target and then moves it until its contrast pairs pass, so a derived theme passes the checks without hand-tuning:

- A brand color that passes with white text, or with ink text, stays exactly as given for primary buttons.
- Status colors keep their usual hues (green, amber, red, blue, purple) and get light and dark variants.
- The six chart colors start from the brand hue and keep the other hues apart.

To set an exact value, override it. An override wins over everything derived:

```ts
createTheme({
  // …
  scale: { "motion-overlay": "200ms" },
  components: { "card-shadow": "none" },
  modes: { light: { "text-brand": "#173d6e" } }
});
```

Byte Forge writes every value by hand with `defineTheme`. Use that only when you must match an existing palette exactly.

## 3. Register it

Add the theme to `packages/theme/src/themes.config.ts`:

```ts
export const themes = [byteForgeTheme, mossTheme, harborTheme] as const;
```

The web app emits it under `[data-theme="harbor"]`, mobile adds it to `ThemeRoot`, and Organization settings offers it.

## 4. Write its DESIGN.md

Copy `packages/theme/src/themes/moss/DESIGN.md` to your theme folder and rewrite the prose. Keep the eight sections in their order (Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts) and keep the `<!-- theme:build color-table -->` markers. `pnpm theme:build` writes the front matter and the color table. People and agents read this file to build screens in your theme, so say what the theme is for and what it never does.

## 5. Build and check

```bash
pnpm theme:build
```

It checks every registered theme, then writes the generated files. A failure names the pair, its ratio, and the nearest color that passes:

```text
harbor light: text-subtle on surface is 2.52:1, needs 4.5:1; the nearest passing text-subtle is #7b7571
```

Fix the input or add an override, then build again. `pnpm theme:check` runs the same checks without writing, and `pnpm --filter @repo/theme test` runs them in CI. The checks cover:

- 63 contrast pairs in both modes, at 4.5:1 for text and 3:1 for UI graphics and chart colors (WCAG 2.2 SC 1.4.3, 1.4.11).
- Control heights of at least 24px (WCAG 2.2 SC 2.5.8).
- The `DESIGN.md` of each theme, with the pinned `@google/design.md` linter.

## 6. Load its fonts

CSS font stacks reach only the web. Fonts that the platform does not have need loading:

- **Web and desktop:** add the `@fontsource` package to `packages/ui/package.json` and import it at the top of `packages/ui/src/styles/globals.css`, beside Geist. A browser downloads a font only when a page uses it, so other themes pay nothing.
- **Mobile:** register the font files with `useFonts` in `apps/mobile/app/_layout.tsx`, then name them in `nativeFonts`, one family per weight. `"system"`, `"system-serif"`, and `"system-mono"` need no loading.

## 7. Look at it

Preview the theme beside Byte Forge in the UI lab (`pnpm lab`), in light and dark. Check a dense table, a form with an error, a dialog, and a chart. Then pick it as the Organization Theme in Organization settings and use the app for a few minutes.

## 8. Make it the default (optional)

Set `defaultTheme` in `themes.config.ts`. `pnpm theme:build` then also updates the root `DESIGN.md`, the browser `theme-color`, the mobile splash colors, and the mobile token fallback. Emails read the default theme at render time. Organizations that never picked a theme follow the new default.

To ship one theme only, remove the others from `themes` and delete their folders. Organization settings hides the Theme section when one theme is registered.
