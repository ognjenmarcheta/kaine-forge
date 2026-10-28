---
name: kaine-create-theme
description: Create, change, or set the default for a theme in @repo/theme, from a brand color, a brand book, a DESIGN.md, or a reference image, and pass the theme checks.
argument-hint: theme name and its brand color or reference
---

# Create a Theme

## Goal and non-goals

Add or change a registered theme so that every app picks it up and it passes the WCAG 2.2 checks in light and dark. Do not hand-edit generated files (`tokens.generated.css`, `design-tokens.ts`, `preset.tokens.js`, the generated parts of `DESIGN.md`). Do not add per-Organization custom colors: an Organization picks a registered theme.

## Steps

1. Read `docs/ui/create-a-theme.md` and Moss (`packages/theme/src/themes/moss/`).
2. **Decide the axes** in one line each: brand color, neutral tint, sans, heading, and mono fonts, heading weight, shape (component radii), density, depth, and motion only if it must change. From a reference image, read them off the image; from a brand book, take the documented values.
3. **Write** `packages/theme/src/themes/<name>/<name>.theme.ts` with `createTheme`. Add overrides (`scale`, `components`, `modes`) only for values the brand fixes exactly.
4. **Write its `DESIGN.md`** from Moss's: the eight sections in order, the color-table markers kept, and prose that says what the theme is for and what it never does.
5. **Register** it in `themes.config.ts`.
6. **Run `pnpm theme:build`.** For each contrast failure, take the nearest passing color it prints, or change the input. Never weaken a check.
7. **Load fonts** that the platform does not have: `@fontsource` in `@repo/ui` for the web, `useFonts` and `nativeFonts` for mobile.
8. **Look at it** in the UI lab (`pnpm lab`) beside Byte Forge, in light and dark, with a table, a form error, a dialog, and a chart.
9. **Run** `pnpm --filter @repo/theme test`, `pnpm ui:check`, and `pnpm check:affected`.

## Report

The axes chosen, the overrides and why, the contrast fixes, the commands run with their results, and screenshots or a lab link when the session can produce them.
