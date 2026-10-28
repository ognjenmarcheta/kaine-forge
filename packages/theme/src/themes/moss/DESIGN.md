---
version: alpha
name: "Moss"
description: "Warm stone neutrals with a forest green for actions, serif headings, compact controls, and flat bordered cards."
colors:
  surface: "#ffffff"
  text: "#19130c"
  surface-sunken: "#fcf6ee"
  text-subtle: "#57514c"
  primary: "#2f6b4f"
  text-brand-inverse: "#ffffff"
  background-brand-bold-hovered: "#236044"
  background-brand-bold-pressed: "#15543a"
  background-danger-bold: "#a43b35"
  text-inverse: "#ffffff"
  surface-raised: "#ffffff"
  surface-overlay: "#ffffff"
  background-success: "#e4fbe7"
  text-success: "#007835"
  background-warning: "#fff0d7"
  text-warning: "#825b00"
  background-danger: "#ffefed"
  text-danger: "#a43b35"
  background-information: "#ecf4ff"
  text-information: "#2063b0"
  background-selected: "#d5f8e5"
  text-selected: "#2f6b4f"
  link: "#2f6b4f"
  text-subtlest: "#706b64"
typography:
  display:
    fontFamily: "ui-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: "3.25rem"
  heading-xlarge:
    fontFamily: "ui-serif"
    fontSize: "1.8125rem"
    fontWeight: 600
    lineHeight: "2rem"
  heading-large:
    fontFamily: "ui-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  heading-medium:
    fontFamily: "ui-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.5rem"
  heading-small:
    fontFamily: "ui-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  heading-xsmall:
    fontFamily: "ui-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1rem"
  heading-xxsmall:
    fontFamily: "ui-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
  body-large:
    fontFamily: "system-ui"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  body:
    fontFamily: "system-ui"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  body-small:
    fontFamily: "system-ui"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1.125rem"
  body-xsmall:
    fontFamily: "system-ui"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: "1rem"
  code-small:
    fontFamily: "ui-monospace"
    fontSize: "0.78125rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "20px"
  full: "9999px"
  button: "6px"
  field: "4px"
  card: "6px"
  overlay: "6px"
  dialog: "8px"
  badge: "4px"
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
  card-padding: "0.75rem"
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
    height: "28px"
  button-primary-hover:
    backgroundColor: "{colors.background-brand-bold-hovered}"
  button-primary-active:
    backgroundColor: "{colors.background-brand-bold-pressed}"
  button-danger:
    backgroundColor: "{colors.background-danger-bold}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.button}"
    height: "28px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    height: "36px"
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

# Moss

## Overview

Moss is the example custom theme. It shows that every axis of a theme can change: color, type, shape, density, and depth. It is calm and editorial, for content-heavy tools where people read and compare: notes, documents, reports, and records.

Warm stone neutrals carry the page. A forest green marks actions, selection, links, and focus. Headings use a serif, controls are compact, and cards are flat with a border.

## Colors

The brand is `#2F6B4F`. White text passes on it, so primary fills use it as is. The palette is generated from the brand and a warm neutral tint (hue 70, low chroma), and every role is placed so that its contrast pairs pass. Status colors keep their usual hues, so a warning still looks like a warning.

<!-- theme:build color-table -->

| Token                   | Use                                    | Light     | Dark      |
| ----------------------- | -------------------------------------- | --------- | --------- |
| `background-brand-bold` | primary actions and selected fills     | `#2f6b4f` | `#2f6b4f` |
| `text-brand-inverse`    | text and icons on primary fills        | `#ffffff` | `#ffffff` |
| `text-brand`            | brand text and links                   | `#2f6b4f` | `#78b495` |
| `border-focused`        | focus rings                            | `#2f6b4f` | `#6ba889` |
| `surface`               | the page                               | `#ffffff` | `#120d09` |
| `surface-sunken`        | wells and the sidebar                  | `#fcf6ee` | `#1a1510` |
| `surface-raised`        | cards                                  | `#ffffff` | `#1e1a15` |
| `surface-overlay`       | menus, popovers, and dialogs           | `#ffffff` | `#221d18` |
| `text`                  | body text and headings                 | `#19130c` | `#f7f3ee` |
| `text-subtle`           | secondary text                         | `#57514c` | `#bcb6af` |
| `text-subtlest`         | metadata and placeholders              | `#706b64` | `#97918a` |
| `border`                | dividers and card hairlines            | `#ece5de` | `#2a2520` |
| `border-bold`           | field borders and other controls (3:1) | `#8b857f` | `#76706a` |
| `background-selected`   | selected rows and navigation           | `#d5f8e5` | `#072b1c` |
| `text-success`          | success messages                       | `#007835` | `#7ccd8e` |
| `text-warning`          | warnings                               | `#825b00` | `#e0ae57` |
| `text-danger`           | errors and destructive actions         | `#a43b35` | `#fb988d` |
| `text-information`      | help and neutral notices               | `#2063b0` | `#85baff` |

<!-- /theme:build -->

## Typography

Body text uses the platform sans (`system-ui`), so it renders fast and native on every device. Headings use the platform serif (`ui-serif`) at weight 600 for an editorial voice. Code uses the platform monospace. Sizes and line heights follow the template scale.

## Layout

Moss uses the template 8px spacing scale with compact density. Controls are 28px tall by default and never below 24px. Cards use 12px padding. Content stays in aligned rows and columns with clear dividers.

## Elevation & Depth

Depth comes from borders and tone, not shadows. Cards are flat with a hairline border on the raised surface. Menus and dialogs keep a light shadow, so they still read as floating above the page.

## Shapes

Small, even corners: 6px for buttons, cards, and menus, 4px for fields and badges, and 8px for dialogs. Nothing is a pill.

## Components

- **Buttons:** one filled green primary button per view. Secondary actions use the subtle neutral button.
- **Fields:** a `border-bold` border that reaches 3:1 against the surface, a visible label, and help or error text under the field.
- **Cards:** flat, bordered, 6px corners, compact padding.
- **Headings:** serif, weight 600. Keep body text, labels, and data in the sans.

## Do's and Don'ts

- Do let the serif headings and the warm neutrals carry the identity.
- Don't add shadows to cards; use the border.
- Don't use the serif for labels, buttons, or numbers in tables.
- Do keep green for actions, selection, links, and focus.
