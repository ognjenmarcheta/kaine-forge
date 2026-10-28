---
version: alpha
name: "Byte Forge"
description: "Cool white and ink-black neutrals with one red-orange for actions, selection, links, and focus."
colors:
  surface: "#ffffff"
  text: "#121419"
  surface-sunken: "#f5f6f8"
  text-subtle: "#4a505c"
  primary: "#d4421a"
  text-brand-inverse: "#ffffff"
  background-brand-bold-hovered: "#bd3812"
  background-brand-bold-pressed: "#a6300f"
  background-danger-bold: "#b42318"
  text-inverse: "#ffffff"
  surface-raised: "#ffffff"
  surface-overlay: "#ffffff"
  background-success: "#e7f4ec"
  text-success: "#1d7a4a"
  background-warning: "#fbf2dc"
  text-warning: "#8a5a00"
  background-danger: "#fdecea"
  text-danger: "#b42318"
  background-information: "#e8f0fb"
  text-information: "#1d5fb8"
  background-selected: "#fde6de"
  text-selected: "#b3360f"
  link: "#b3360f"
  text-subtlest: "#646b78"
typography:
  heading-xlarge:
    fontFamily: "Geist Variable"
    fontSize: "1.8125rem"
    fontWeight: 500
    lineHeight: "2rem"
  heading-large:
    fontFamily: "Geist Variable"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: "1.75rem"
  heading-medium:
    fontFamily: "Geist Variable"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: "1.5rem"
  heading-small:
    fontFamily: "Geist Variable"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  heading-xsmall:
    fontFamily: "Geist Variable"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1rem"
  heading-xxsmall:
    fontFamily: "Geist Variable"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
  body-large:
    fontFamily: "Geist Variable"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  body:
    fontFamily: "Geist Variable"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  body-small:
    fontFamily: "Geist Variable"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1.125rem"
  body-xsmall:
    fontFamily: "Geist Variable"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: "1rem"
  code-small:
    fontFamily: "Geist Mono Variable"
    fontSize: "0.78125rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "20px"
  full: "9999px"
  button: "9999px"
  field: "8px"
  card: "20px"
  overlay: "12px"
  dialog: "20px"
  badge: "9999px"
spacing:
  "025": "0.125rem"
  "050": "0.25rem"
  "075": "0.375rem"
  "100": "0.5rem"
  "150": "0.75rem"
  "200": "1rem"
  "250": "1.25rem"
  "300": "1.5rem"
  "400": "2rem"
  "500": "2.5rem"
  "600": "3rem"
  "800": "4rem"
  "1000": "5rem"
  card-padding: "1rem"
components:
  page:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
  sidebar:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text-subtle}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-brand-inverse}"
    rounded: "{rounded.button}"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.background-brand-bold-hovered}"
  button-primary-active:
    backgroundColor: "{colors.background-brand-bold-pressed}"
  button-danger:
    backgroundColor: "{colors.background-danger-bold}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.button}"
    height: "32px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    height: "40px"
  card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-padding}"
  menu:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.text}"
    rounded: "{rounded.overlay}"
  dialog:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.text}"
    rounded: "{rounded.dialog}"
  badge-success:
    backgroundColor: "{colors.background-success}"
    textColor: "{colors.text-success}"
    rounded: "{rounded.badge}"
  badge-warning:
    backgroundColor: "{colors.background-warning}"
    textColor: "{colors.text-warning}"
    rounded: "{rounded.badge}"
  badge-danger:
    backgroundColor: "{colors.background-danger}"
    textColor: "{colors.text-danger}"
    rounded: "{rounded.badge}"
  badge-information:
    backgroundColor: "{colors.background-information}"
    textColor: "{colors.text-information}"
    rounded: "{rounded.badge}"
  navigation-selected:
    backgroundColor: "{colors.background-selected}"
    textColor: "{colors.text-selected}"
  link:
    textColor: "{colors.link}"
  metadata:
    textColor: "{colors.text-subtlest}"
---

> Generated from `packages/theme/src/themes/byte-forge/DESIGN.md` by `pnpm theme:build`. Edit that file, not this copy.

# Byte Forge

## Overview

Byte Forge is the default identity of the template. It is calm, exact, and built for work that people do every day: dashboards, lists, settings, and long reading. Cool white and ink-black neutrals carry the page. One red-orange marks the next action, the current selection, links, and focus. Orange never fills a whole surface.

The tone is professional and quiet. Density is medium: compact enough for tools, with enough space that a screen reads at a glance.

## Colors

The brand seed is `#F15A24`. White text on it reaches only about 3.4:1, so primary fills use a deeper red-orange with white text, and brand text uses a darker step on light surfaces and a lighter step on dark ones. Hovered and pressed fills get darker, so white text keeps its contrast.

Neutrals are cool grays with a faint blue tint. Status colors are green (success), amber (warning), red (danger), blue (information), and purple (discovery). A status color always comes with a word or an icon.

<!-- theme:build color-table -->

| Token                   | Use                                    | Light     | Dark      |
| ----------------------- | -------------------------------------- | --------- | --------- |
| `background-brand-bold` | primary actions and selected fills     | `#d4421a` | `#d4421a` |
| `text-brand-inverse`    | text and icons on primary fills        | `#ffffff` | `#ffffff` |
| `text-brand`            | brand text and links                   | `#b3360f` | `#ff7a50` |
| `border-focused`        | focus rings                            | `#c23a14` | `#ff6a3d` |
| `surface`               | the page                               | `#ffffff` | `#0c0e12` |
| `surface-sunken`        | wells and the sidebar                  | `#f5f6f8` | `#14171d` |
| `surface-raised`        | cards                                  | `#ffffff` | `#14171d` |
| `surface-overlay`       | menus, popovers, and dialogs           | `#ffffff` | `#1c2027` |
| `text`                  | body text and headings                 | `#121419` | `#f2f3f5` |
| `text-subtle`           | secondary text                         | `#4a505c` | `#aab1bd` |
| `text-subtlest`         | metadata and placeholders              | `#646b78` | `#868d99` |
| `border`                | dividers and card hairlines            | `#e3e6eb` | `#23272f` |
| `border-bold`           | field borders and other controls (3:1) | `#7d8491` | `#6b7380` |
| `background-selected`   | selected rows and navigation           | `#fde6de` | `#2e140c` |
| `text-success`          | success messages                       | `#1d7a4a` | `#5fc791` |
| `text-warning`          | warnings                               | `#8a5a00` | `#e6b44a` |
| `text-danger`           | errors and destructive actions         | `#b42318` | `#ff8a7a` |
| `text-information`      | help and neutral notices               | `#1d5fb8` | `#7fb0f5` |

<!-- /theme:build -->

## Typography

Geist and Geist Mono, self-hosted so the desktop app works offline. Body text is 14px on a 20px line. Headings use weight 500, and the small headings use 600. Figures in tables and stat tiles use tabular numerals. Type never scales with the viewport width.

## Layout

Spacing follows an 8px scale with 2px and 4px half-steps. Web and desktop use a full-height sidebar shell; mobile uses a drawer. Work lists are aligned rows with dividers, not cards inside cards. Reading columns stop at 768px. Default controls are 32px tall, and touch controls are 48px.

## Elevation & Depth

Cards sit on `surface-raised` with a hairline border and a soft raised shadow. Menus and popovers use the overlay shadow, and dialogs use the floating shadow over a dimmed blanket. In dark mode, raised surfaces are lighter than the page, so depth still reads without strong shadows.

## Shapes

Buttons and badges are pills. Fields use 8px corners, menus 12px, and cards and dialogs 20px. Corners come only from the scale; there are no values between its steps.

## Components

- **Buttons:** one filled primary button per view, in the brand fill. Secondary actions use the subtle neutral button; tertiary actions use ghost or link buttons. Destructive actions use the danger button and a confirmation.
- **Fields:** a `border-bold` border that reaches 3:1 against the surface, a visible label, and help or error text under the field. Errors use `text-danger` and an icon.
- **Focus:** a 2px `border-focused` ring with a 2px offset on every interactive element.
- **Navigation:** the selected item uses `background-selected` with `text-selected` and an inset start indicator, also on hover.
- **Badges and status:** pill badges with a tinted fill and its matching text color.

## Do's and Don'ts

- Do keep orange for actions, selection, links, and focus.
- Don't fill a page, a card, or a header with orange.
- Do pair every status color with a word or an icon.
- Don't put a second filled primary button in the same view.
- Do show real data and empty states, never invented analytics.
- Don't nest a card inside a card.
