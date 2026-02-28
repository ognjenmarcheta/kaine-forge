# Design System Documentation

> Built on [Atlassian Design System](https://atlassian.design/) foundations with select practices from [GitHub's Primer](https://primer.style/), adapted for **Tailwind CSS v4** in `@repo/ui` and web/desktop surfaces, **NativeWind (Tailwind CSS v3 pipeline)** on mobile, and **CSS custom properties** across all platforms.

> **Scope note:** Unless explicitly marked as future/optional, this document describes behavior and token/theme support that is currently implemented in the repository.
>
> <!-- TEMPLATE_POLICY_BLOCK_START -->
>
> **Template-repo context:** This repository is a monorepo boilerplate template. This design system defines current defaults for reuse, not compatibility guarantees with older patterns.
>
> **Clean-slate policy:** Because this is a boilerplate template repository, backward compatibility is not required for superseded design patterns. Rules here define current-state requirements, not migration guidance.
>
> **Non-goals:** This document intentionally excludes:
>
> - backward-compatibility commitments for older token/component patterns
> - migration/deprecation playbooks for retired visual conventions
> - dual-standard visual support policies
>
> When adopting this template for a product repository, remove this `TEMPLATE_POLICY_BLOCK` and define a product-specific design compatibility policy.
>
> <!-- TEMPLATE_POLICY_BLOCK_END -->
>
> **Document boundary:** This document is authoritative for visual language, design tokens, theming, and styling behavior. `MONOREPO_GUIDE.md` remains authoritative for architecture, package topology, runtime/data rules, and engineering conventions.

---

## Table of Contents

1. [Principles](#1-principles)
2. [Token Architecture](#2-token-architecture)
3. [Color](#3-color)
4. [Typography](#4-typography)
5. [Size & Spacing](#5-size--spacing)
6. [Elevation & Shadows](#6-elevation--shadows)
7. [Border & Shape](#7-border--shape)
8. [Theming](#8-theming)
9. [Primitives (Component Foundations)](#9-primitives-component-foundations)
10. [UI Patterns](#10-ui-patterns)
11. [Accessibility](#11-accessibility)
12. [Token Reference Tables](#12-token-reference-tables)

---

## 1. Principles

### 1.1 — Bold

Our experiences should be confident and intentional. Bold doesn't mean loud — it means purposeful. Every element should have a clear reason for being there, and visual hierarchy should guide users effortlessly through the interface.

### 1.2 — Optimistic

Design should feel empowering. Feedback is constructive, empty states are encouraging, and the overall tone communicates that the tool is working with you. Success states are celebrated, error states are helpful.

### 1.3 — Practical, with clarity

We build tools for work. The interface must be efficient and task-focused first. Content comes first — interfaces should be clean, calm, and uncluttered. Every visual element must serve the content and the task at hand. Strip away anything that doesn't earn its place.

### 1.4 — Consistent

Shared foundations create predictability. When every surface, text style, and interactive element draws from the same token pool, the interface becomes self-documenting. Users build a mental model once and it holds everywhere.

### 1.5 — Accessible by default

Accessibility is baked into foundations, not bolted on after. Tokens are designed to meet contrast requirements across all themes. Interactive elements are keyboard-navigable. Color is never the sole communicator of meaning — it is always paired with text, iconography, or pattern.

### 1.6 — Adaptable

The system must work across color modes (light, dark, high contrast), viewport sizes (mobile through ultrawide), input methods (pointer, touch, keyboard), and platforms (web, desktop via Tauri, mobile via Expo). Tokens and patterns are designed to flex without breaking.

### 1.7 — Token-first

Choose tokens based on **meaning**, not specific values. Don't use a token because the color appears to match — use it because the semantic role fits. This ensures the interface remains correct across themes, modes, and future design evolution.

---

## 2. Token Architecture

Design tokens are name–value pairings that represent small, repeatable design decisions. They are the single source of truth for every visual value, delivered as CSS custom properties, mapped to Tailwind utility classes, and consumed by shadcn/ui components.

### 2.1 — Three-Tier Hierarchy

Tokens are organized into three tiers (from Primer's model), with Atlassian's foundation-based naming:

```
┌─────────────────────────────────────────────────────────────┐
│  Tier 3: Component / Pattern Tokens                         │
│  Scoped to a specific component or UI pattern.              │
│  e.g. --ds-button-brand-bg-hover                            │
│  e.g. --ds-control-danger-border-rest                       │
├─────────────────────────────────────────────────────────────┤
│  Tier 2: Functional Tokens  ← PRIMARY LAYER FOR CONSUMERS  │
│  Semantic meaning. Respect color modes.                     │
│  e.g. --ds-text, --ds-background-danger-bold                │
├─────────────────────────────────────────────────────────────┤
│  Tier 1: Base Tokens                                        │
│  Raw values. Never used directly in UI code.                │
│  e.g. --ds-base-neutral-500, --ds-base-blue-700             │
└─────────────────────────────────────────────────────────────┘
```

**Rules:**

- **Base tokens** define raw scale values. They do NOT respect color modes. They are reference-only — never use them directly in component CSS or Tailwind classes.
- **Functional tokens** are the primary API for building UI. They carry semantic meaning and automatically adapt across color modes and themes. All functional tokens use the `--ds-` prefix.
- **Component/pattern tokens** handle one-off values too specific for the functional layer. They reference functional or base tokens and also respect color modes.

### 2.2 — Token Foundations

Tokens are organized by **foundation** — the type of visual attribute they control:

| Foundation     | Prefix                                                             | Examples                                     |
| -------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| **Color**      | `--ds-text-*`, `--ds-background-*`, `--ds-border-*`, `--ds-icon-*` | `--ds-text`, `--ds-background-success-bold`  |
| **Elevation**  | `--ds-surface-*`, `--ds-shadow-*`                                  | `--ds-surface-raised`, `--ds-shadow-overlay` |
| **Spacing**    | `--ds-space-*`                                                     | `--ds-space-100`, `--ds-space-200`           |
| **Typography** | `--ds-font-*`                                                      | `--ds-font-heading-large`, `--ds-font-body`  |
| **Border**     | `--ds-border-*`, `--ds-radius-*`                                   | `--ds-border-width`, `--ds-radius-100`       |

### 2.3 — Token Naming Convention

Tokens follow a structured, human-readable pattern:

```
--ds-{foundation}-{property}-{modifier?}-{emphasis?}-{state?}
```

| Segment      | Purpose                                | Examples                                          |
| ------------ | -------------------------------------- | ------------------------------------------------- |
| `foundation` | Visual attribute type                  | `text`, `background`, `border`, `surface`         |
| `property`   | CSS property or UI concept             | `neutral`, `success`, `danger`                    |
| `modifier`   | Color role or semantic meaning         | `accent-blue`, `brand`                            |
| `emphasis`   | Contrast level against default surface | `subtlest`, `subtle`, `bold`, `bolder`, `boldest` |
| `state`      | Interaction state                      | `hovered`, `pressed`, `focused`, `disabled`       |

Examples:

```
--ds-text                                → Default body text
--ds-text-subtle                         → Secondary/muted text
--ds-text-success                        → Success message text
--ds-background-accent-blue-subtlest     → Lightest blue accent background
--ds-background-danger-bold              → Strong danger background
--ds-background-neutral-hovered          → Neutral bg on hover
--ds-border-focused                      → Focus ring border color
--ds-surface-raised                      → Raised card surface
--ds-shadow-overlay                      → Overlay drop shadow
--ds-space-200                           → 16px spacing (200% of 8px base)
```

### 2.4 — Emphasis Scale

The emphasis scale controls how much contrast an element has against the default surface, from barely visible to fully saturated:

```
subtlest ──── subtle ──── [default] ──── bold ──── bolder ──── boldest
   ↑                                                               ↑
Low contrast                                              Maximum contrast
(background tint)                                    (solid saturated fill)
```

| Level       | Typical Use                              | Pairing                  |
| ----------- | ---------------------------------------- | ------------------------ |
| `subtlest`  | Lightest background tint for status/info | Default text tokens      |
| `subtle`    | Slightly stronger tint                   | Default text tokens      |
| _(default)_ | Standard foreground/border color         | Default surface          |
| `bold`      | Strong fill (buttons, badges)            | `--ds-text-inverse` text |
| `bolder`    | Even stronger fill                       | `--ds-text-inverse` text |
| `boldest`   | Maximum saturation                       | `--ds-text-inverse` text |

**Rule:** Text on `bold`/`bolder`/`boldest` backgrounds must use **inverse** tokens (white/dark text) to maintain contrast. Text on `subtlest`/`subtle` backgrounds uses **default** semantic text tokens.

### 2.5 — Delivery as CSS Custom Properties

All tokens are defined as CSS custom properties in a global stylesheet, imported at the application root:

```css
/* packages/ui/src/styles/globals.css */
@layer tokens {
  :root {
    /* Base tokens — raw scale values (never use directly) */
    --ds-base-neutral-0: #ffffff;
    --ds-base-neutral-100: #f7f8f9;
    --ds-base-blue-500: #0c66e4;
    /* ... */
  }

  :root,
  [data-theme="light"] {
    /* Functional tokens — light mode */
    --ds-text: #172b4d;
    --ds-background-default: #ffffff;
    --ds-surface: #ffffff;
    /* ... */
  }

  [data-theme="dark"] {
    /* Functional tokens — dark mode */
    --ds-text: #b6c2cf;
    --ds-background-default: #1d2125;
    --ds-surface: #1d2125;
    /* ... */
  }
}
```

The Tailwind preset in `@repo/config` maps these CSS variables to utility classes:

```js
// packages/config/tailwind/preset.js
module.exports = {
  theme: {
    extend: {
      colors: {
        "ds-text": {
          DEFAULT: "var(--ds-text)",
          subtle: "var(--ds-text-subtle)",
          subtlest: "var(--ds-text-subtlest)",
          inverse: "var(--ds-text-inverse)",
          disabled: "var(--ds-text-disabled)",
          brand: "var(--ds-text-brand)",
          success: "var(--ds-text-success)",
          danger: "var(--ds-text-danger)",
          warning: {
            DEFAULT: "var(--ds-text-warning)",
            inverse: "var(--ds-text-warning-inverse)"
          },
          attention: "var(--ds-text-attention)",
          severe: "var(--ds-text-severe)",
          information: "var(--ds-text-information)",
          discovery: "var(--ds-text-discovery)",
          open: "var(--ds-text-open)",
          closed: "var(--ds-text-closed)",
          done: "var(--ds-text-done)"
        },
        "ds-bg": {
          DEFAULT: "var(--ds-background-default)",
          neutral: {
            DEFAULT: "var(--ds-background-neutral)",
            subtle: "var(--ds-background-neutral-subtle)",
            "subtle-hovered": "var(--ds-background-neutral-subtle-hovered)",
            bold: "var(--ds-background-neutral-bold)"
          },
          brand: {
            bold: "var(--ds-background-brand-bold)",
            "bold-hovered": "var(--ds-background-brand-bold-hovered)"
          },
          success: {
            DEFAULT: "var(--ds-background-success)",
            bold: "var(--ds-background-success-bold)"
          },
          danger: {
            DEFAULT: "var(--ds-background-danger)",
            bold: "var(--ds-background-danger-bold)"
          },
          warning: {
            DEFAULT: "var(--ds-background-warning)",
            bold: "var(--ds-background-warning-bold)"
          },
          attention: {
            DEFAULT: "var(--ds-background-attention)",
            bold: "var(--ds-background-attention-bold)"
          },
          severe: {
            DEFAULT: "var(--ds-background-severe)",
            bold: "var(--ds-background-severe-bold)"
          },
          information: {
            DEFAULT: "var(--ds-background-information)",
            bold: "var(--ds-background-information-bold)"
          },
          discovery: {
            DEFAULT: "var(--ds-background-discovery)",
            bold: "var(--ds-background-discovery-bold)"
          },
          selected: {
            DEFAULT: "var(--ds-background-selected)",
            bold: "var(--ds-background-selected-bold)"
          },
          open: "var(--ds-background-open)",
          closed: "var(--ds-background-closed)",
          done: "var(--ds-background-done)"
        },
        "ds-border": {
          DEFAULT: "var(--ds-border)",
          bold: "var(--ds-border-bold)",
          focused: "var(--ds-border-focused)",
          selected: "var(--ds-border-selected)",
          brand: "var(--ds-border-brand)",
          success: "var(--ds-border-success)",
          danger: "var(--ds-border-danger)",
          warning: "var(--ds-border-warning)",
          attention: "var(--ds-border-attention)",
          severe: "var(--ds-border-severe)",
          information: "var(--ds-border-information)",
          discovery: "var(--ds-border-discovery)"
        },
        "ds-surface": {
          DEFAULT: "var(--ds-surface)",
          sunken: "var(--ds-surface-sunken)",
          raised: "var(--ds-surface-raised)",
          "raised-hovered": "var(--ds-surface-raised-hovered)",
          "raised-pressed": "var(--ds-surface-raised-pressed)",
          overlay: "var(--ds-surface-overlay)",
          "overlay-hovered": "var(--ds-surface-overlay-hovered)",
          "overlay-pressed": "var(--ds-surface-overlay-pressed)"
        },
        "ds-icon": {
          DEFAULT: "var(--ds-icon)",
          subtle: "var(--ds-icon-subtle)",
          inverse: "var(--ds-icon-inverse)",
          disabled: "var(--ds-icon-disabled)",
          brand: "var(--ds-icon-brand)",
          success: "var(--ds-icon-success)",
          danger: "var(--ds-icon-danger)",
          warning: "var(--ds-icon-warning)",
          information: "var(--ds-icon-information)",
          discovery: "var(--ds-icon-discovery)"
        },
        "ds-link": {
          DEFAULT: "var(--ds-link)",
          pressed: "var(--ds-link-pressed)"
        },
        "ds-blanket": { DEFAULT: "var(--ds-blanket)" }
      }
      // ... spacing, shadows, typography follow
    }
  }
};
```

This means in component code you write `text-ds-text-subtle` or `bg-ds-bg-success` and it resolves through CSS variables, automatically adapting to the active theme.

---

## 3. Color

Color is applied through design tokens, not raw hex values. You choose a token based on its semantic meaning — what the color communicates — not what it looks like. This ensures correctness across all themes.

### 3.1 — Color Roles

Nine semantic color roles, each tied to a specific meaning:

| Role            | Meaning                                       | Token Prefix    |
| --------------- | --------------------------------------------- | --------------- |
| **Neutral**     | Default UI chrome, dividers, text             | `*.neutral`     |
| **Brand**       | Brand identity, primary actions               | `*.brand`       |
| **Information** | Informational messages, help, guidance        | `*.information` |
| **Success**     | Positive outcomes, completion, availability   | `*.success`     |
| **Warning**     | Caution, potential issues, pending states     | `*.warning`     |
| **Danger**      | Errors, destructive actions, critical alerts  | `*.danger`      |
| **Attention**   | Non-critical warnings, items requiring notice | `*.attention`   |
| **Severe**      | Severe warnings, heatmap-level urgency        | `*.severe`      |
| **Discovery**   | New features, onboarding, exploration         | `*.discovery`   |

### 3.2 — Workflow State Colors

In addition to semantic roles, the system defines workflow state colors for task/item status tracking:

| State      | Meaning                   | Foreground Token   | Background Token         |
| ---------- | ------------------------- | ------------------ | ------------------------ |
| **Open**   | Active / in-progress item | `--ds-text-open`   | `--ds-background-open`   |
| **Closed** | Closed / rejected item    | `--ds-text-closed` | `--ds-background-closed` |
| **Done**   | Completed item            | `--ds-text-done`   | `--ds-background-done`   |

These are separate from semantic roles because they represent lifecycle state, not severity.

### 3.3 — Accent Colors

Accents add personality without semantic meaning. Use accents for decorative purposes — avatars, labels, categories, tags — where color differentiates but does not communicate status.

Available accent hues: **blue, teal, green, lime, yellow, orange, red, magenta, purple**.

Each accent has tokens across all properties (text, icon, background, border) with emphasis levels:

```
--ds-text-accent-blue                  → Default blue text
--ds-text-accent-blue-bolder           → Bolder blue text
--ds-icon-accent-blue                  → Default blue icon
--ds-background-accent-blue-subtlest   → Lightest blue bg
--ds-background-accent-blue-subtle     → Light blue bg
--ds-background-accent-blue-bolder     → Strong blue bg
--ds-border-accent-blue                → Blue border
```

**Rule:** Don't use accents when color has semantic meaning. If something represents "success", use `*.success` tokens, not `*.accent.green`.

### 3.4 — Base Color Scales (Tier 1 — Reference Only)

The raw palette uses a `{ColorName}{Number}` convention. These are **never used directly** — they exist only as reference values behind functional tokens.

#### Neutral Scale

A 14-step grayscale from white (0) to near-black (13). By inverting directions between light and dark modes, functional tokens adapt with minimal overrides.

```
Light: 0 (white) ─────────────────────── 13 (near-black)
Dark:  0 (near-black) ────────────────── 13 (white)
```

| Step | Light Value | Dark Value | Typical Role               |
| ---- | ----------- | ---------- | -------------------------- |
| 0    | `#ffffff`   | `#1D2125`  | Page background            |
| 1    | `#f7f8f9`   | `#22272B`  | Subtle / sunken background |
| 2    | `#f1f2f4`   | `#282E33`  | Muted background           |
| 3    | `#dcdfe4`   | `#2C333A`  | Border default             |
| 4    | `#b3b9c4`   | `#38414A`  | Border muted               |
| 5    | `#8590a2`   | `#596773`  | Placeholder text           |
| 6    | `#758195`   | `#738496`  | Subtle text                |
| 7    | `#626f86`   | `#8C9BAB`  | Muted text / icons         |
| 8    | `#44546f`   | `#9FADBC`  | Secondary text             |
| 9    | `#2c3e5d`   | `#B6C2CF`  | Default text               |
| 10   | `#172b4d`   | `#C7D1DB`  | Strong text                |
| 11   | `#091e42`   | `#DEE4EA`  | Heading text               |
| 12   | `#091e42`   | `#F7F8F9`  | High emphasis              |
| 13   | `#000000`   | `#FFFFFF`  | Maximum contrast           |

#### Chromatic Scales

Each accent color has a 10-step scale (0–9), from lightest tint to darkest shade:

| Scale Name | Hue     | Semantic Role             |
| ---------- | ------- | ------------------------- |
| `Blue`     | Blue    | Brand, information, links |
| `Teal`     | Teal    | Accent                    |
| `Green`    | Green   | Success                   |
| `Lime`     | Lime    | Accent                    |
| `Yellow`   | Yellow  | Warning, attention        |
| `Orange`   | Orange  | Severe, accent            |
| `Red`      | Red     | Danger                    |
| `Magenta`  | Magenta | Accent                    |
| `Purple`   | Purple  | Discovery                 |

### 3.5 — Text Color Tokens

| Token                       | Role                                           |
| --------------------------- | ---------------------------------------------- |
| `--ds-text`                 | Default body text                              |
| `--ds-text-subtle`          | Secondary text, descriptions                   |
| `--ds-text-subtlest`        | Placeholder, tertiary text                     |
| `--ds-text-inverse`         | Text on bold/emphasis backgrounds              |
| `--ds-text-disabled`        | Disabled interactive text                      |
| `--ds-text-brand`           | Brand-colored text (primary actions)           |
| `--ds-text-success`         | Success messages                               |
| `--ds-text-danger`          | Error messages                                 |
| `--ds-text-warning`         | Warning text                                   |
| `--ds-text-warning-inverse` | Text on bold warning background (special WCAG) |
| `--ds-text-attention`       | Non-critical warning text                      |
| `--ds-text-severe`          | Severe warning text                            |
| `--ds-text-information`     | Informational text                             |
| `--ds-text-discovery`       | Discovery/new feature text                     |
| `--ds-text-open`            | Open workflow state                            |
| `--ds-text-closed`          | Closed workflow state                          |
| `--ds-text-done`            | Completed workflow state                       |
| `--ds-text-selected`        | Selected item text                             |
| `--ds-link`                 | Hyperlink text                                 |
| `--ds-link-pressed`         | Hyperlink pressed state                        |

### 3.6 — Background Color Tokens

Each role has a spectrum from `subtlest` through `bold`:

| Token Pattern                         | Use Case                                |
| ------------------------------------- | --------------------------------------- |
| `--ds-background-{role}`              | Default role background (lightest tint) |
| `--ds-background-{role}-subtlest`     | Barely visible tint (banner bg)         |
| `--ds-background-{role}-subtle`       | Light tint (list item bg)               |
| `--ds-background-{role}-bold`         | Strong fill (button bg, badge bg)       |
| `--ds-background-{role}-bold-hovered` | Strong fill on hover                    |
| `--ds-background-{role}-bold-pressed` | Strong fill on press                    |

For **neutral** backgrounds:

| Token                                    | Use Case                            |
| ---------------------------------------- | ----------------------------------- |
| `--ds-background-default`                | Page canvas                         |
| `--ds-background-neutral-subtle`         | Subtle fill (secondary button rest) |
| `--ds-background-neutral-subtle-hovered` | Subtle fill on hover                |
| `--ds-background-neutral`                | Standard neutral fill               |
| `--ds-background-neutral-hovered`        | Standard fill on hover              |
| `--ds-background-neutral-bold`           | Strong neutral fill                 |

For **selected** state:

| Token                           | Use Case                   |
| ------------------------------- | -------------------------- |
| `--ds-background-selected`      | Selected item background   |
| `--ds-background-selected-bold` | Bold selected (active nav) |

For **workflow** states:

| Token                    | Use Case          |
| ------------------------ | ----------------- |
| `--ds-background-open`   | Open state tint   |
| `--ds-background-closed` | Closed state tint |
| `--ds-background-done`   | Done state tint   |

### 3.7 — Icon Color Tokens

Dedicated tokens for icon colors, separate from text tokens for independent tuning:

| Token                   | Role                     |
| ----------------------- | ------------------------ |
| `--ds-icon`             | Default icon color       |
| `--ds-icon-subtle`      | Secondary icon           |
| `--ds-icon-inverse`     | Icon on bold backgrounds |
| `--ds-icon-disabled`    | Disabled state           |
| `--ds-icon-brand`       | Brand icon               |
| `--ds-icon-success`     | Success icon             |
| `--ds-icon-danger`      | Danger icon              |
| `--ds-icon-warning`     | Warning icon             |
| `--ds-icon-attention`   | Attention icon           |
| `--ds-icon-severe`      | Severe icon              |
| `--ds-icon-information` | Information icon         |
| `--ds-icon-discovery`   | Discovery icon           |
| `--ds-icon-open`        | Open workflow icon       |
| `--ds-icon-closed`      | Closed workflow icon     |
| `--ds-icon-done`        | Done workflow icon       |

### 3.8 — Border Color Tokens

| Token                     | Use Case                               |
| ------------------------- | -------------------------------------- |
| `--ds-border`             | Default borders, dividers              |
| `--ds-border-bold`        | Higher emphasis borders                |
| `--ds-border-focused`     | Focus ring color (keyboard navigation) |
| `--ds-border-selected`    | Selected item indicator                |
| `--ds-border-brand`       | Brand accent border                    |
| `--ds-border-success`     | Success state border                   |
| `--ds-border-danger`      | Danger state border                    |
| `--ds-border-warning`     | Warning state border                   |
| `--ds-border-attention`   | Attention state border                 |
| `--ds-border-severe`      | Severe state border                    |
| `--ds-border-information` | Information border                     |
| `--ds-border-discovery`   | Discovery/new feature border           |

### 3.9 — Interaction State Tokens

Interactive elements have `hovered`, `pressed`, and `focused` variants built into the token naming:

```
--ds-background-neutral-subtle               → rest
--ds-background-neutral-subtle-hovered       → mouse hover
--ds-background-neutral-subtle-pressed       → mouse down / active
```

For surfaces:

```
--ds-surface-raised                          → rest
--ds-surface-raised-hovered                  → hover
--ds-surface-raised-pressed                  → press
```

**Rule:** Use token-based interaction states — never custom opacity hacks or hardcoded hover colors.

### 3.10 — Alpha (Transparent) & Blanket Tokens

Alpha tokens allow UI to adapt across different surface levels without hardcoding opaque values:

| Token                   | Use Case                               |
| ----------------------- | -------------------------------------- |
| `--ds-blanket`          | Semi-transparent modal/dialog backdrop |
| `--ds-blanket-selected` | Semi-transparent selection overlay     |

Use alpha backgrounds when an element needs to work across multiple surface levels.

### 3.11 — Inverse & Warning Special Case

Warning uses **yellow** as its base, which creates contrast challenges. Special `warning.inverse` tokens exist for text and icons placed on bold warning backgrounds:

```html
<!-- Correct: warning banner with inverse text -->
<div class="bg-ds-bg-warning-bold text-ds-text-warning-inverse p-3 rounded">
  ⚠ This action cannot be undone.
</div>
```

### 3.12 — Color Pairing Rules

These rules ensure readability and visual harmony:

1. **Semantic foregrounds pair with their matching backgrounds.** Use `--ds-text-success` on `--ds-background-success`, not on `--ds-background-danger`.
2. **Bold backgrounds always pair with inverse text.** Never place semantic foreground colors on bold backgrounds — use `--ds-text-inverse` instead.
3. **Subtle text (`--ds-text-subtle`) only pairs with default or subtle surfaces.** Never combine muted text with colored backgrounds.
4. **Never use color alone to convey meaning.** Always pair with text labels, icons, or patterns.
5. **Minimum contrast ratios:** Normal text ≥ 4.5:1, large text ≥ 3:1, interactive elements ≥ 3:1 against adjacent colors. High-contrast themes target ≥ 7:1.
6. **Don't use accents for semantic meaning.** If something represents "success", use `*.success` tokens, not `*.accent.green`.

### 3.13 — Color in Tailwind

```html
<!-- Default text on default background -->
<p class="text-ds-text bg-ds-bg">Hello world</p>

<!-- Danger badge with inverse text -->
<span
  class="text-ds-text-inverse bg-ds-bg-danger-bold rounded-full px-2 py-0.5 text-xs font-medium"
>
  Error
</span>

<!-- Success message with tinted background -->
<div class="bg-ds-bg-success border border-ds-border-success text-ds-text-success rounded-md p-3">
  Operation successful
</div>

<!-- Discovery banner -->
<div class="bg-ds-bg-discovery-bold text-ds-text-inverse p-3 rounded">✨ Try our new feature</div>
```

---

## 4. Typography

Typography establishes hierarchy, readability, and rhythm. All type tokens use `rem` units for accessible browser zoom. The system uses a **minor third scale** (1.2 ratio), with line heights rounded to 4px multiples.

### 4.1 — Font Stacks

```css
--ds-font-family-sans:
  -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans", Helvetica, Arial,
  sans-serif, "Apple Color Emoji", "Segoe UI Emoji";

--ds-font-family-mono:
  ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
```

System fonts are used for performance. No custom font files need to be loaded.

### 4.2 — Heading Type Scale

| Token                       | Size (rem) | Size (px) | Line-height | Weight | Use Case             |
| --------------------------- | ---------- | --------- | ----------- | ------ | -------------------- |
| `--ds-font-heading-display` | 3rem       | 48px      | 1.15 (56px) | 300    | Hero headings        |
| `--ds-font-heading-xxlarge` | 2.1875rem  | 35px      | 1.14 (40px) | 600    | Page titles          |
| `--ds-font-heading-xlarge`  | 1.8125rem  | 29px      | 1.1 (32px)  | 600    | Major section heads  |
| `--ds-font-heading-large`   | 1.5rem     | 24px      | 1.17 (28px) | 600    | Section headings     |
| `--ds-font-heading-medium`  | 1.25rem    | 20px      | 1.2 (24px)  | 500    | Card headings        |
| `--ds-font-heading-small`   | 1rem       | 16px      | 1.25 (20px) | 600    | Sub-section headings |
| `--ds-font-heading-xsmall`  | 0.875rem   | 14px      | 1.14 (16px) | 600    | Compact headings     |
| `--ds-font-heading-xxsmall` | 0.75rem    | 12px      | 1.33 (16px) | 600    | Overline text        |

#### Responsive Heading Adjustments

On narrow viewports (< 768px), display and large heading sizes scale down:

| Token (narrow)              | Desktop | Mobile |
| --------------------------- | ------- | ------ |
| `--ds-font-heading-display` | 48px    | 40px   |
| `--ds-font-heading-xxlarge` | 35px    | 29px   |
| `--ds-font-heading-xlarge`  | 29px    | 24px   |
| `--ds-font-heading-large`   | 24px    | 22px   |

### 4.3 — Body Type Scale

| Token                   | Size (rem) | Size (px) | Line-height | Weight | Use Case               |
| ----------------------- | ---------- | --------- | ----------- | ------ | ---------------------- |
| `--ds-font-body-large`  | 1rem       | 16px      | 1.5 (24px)  | 400    | Long-form content      |
| `--ds-font-body`        | 0.875rem   | 14px      | 1.43 (20px) | 400    | Default (components)   |
| `--ds-font-body-small`  | 0.75rem    | 12px      | 1.5 (18px)  | 400    | Captions, metadata     |
| `--ds-font-body-xsmall` | 0.6875rem  | 11px      | 1.45 (16px) | 400    | Fine print (sparingly) |

#### Code Style

| Token            | Size                           | Line-height | Family                  |
| ---------------- | ------------------------------ | ----------- | ----------------------- |
| `--ds-font-code` | Relative to container (~87.5%) | 1           | `--ds-font-family-mono` |

### 4.4 — Font Weights

| Token                       | Value | Use Case                           |
| --------------------------- | ----- | ---------------------------------- |
| `--ds-font-weight-light`    | 300   | Decorative, display headings only  |
| `--ds-font-weight-regular`  | 400   | Body text, paragraphs              |
| `--ds-font-weight-medium`   | 500   | Components, alignment with icons   |
| `--ds-font-weight-semibold` | 600   | Headings, strong emphasis          |
| `--ds-font-weight-bold`     | 700   | Rare: extreme emphasis (sparingly) |

**Medium** (500) is the default for component text, as it aligns visually with iconography at the same optical weight. **Regular** (400) is for paragraphs and long-form content.

### 4.5 — Line Heights

Three line-height tokens for reference:

| Token                       | Value | Use Case                     |
| --------------------------- | ----- | ---------------------------- |
| `--ds-lineHeight-default`   | 1.5   | Body text, descriptions      |
| `--ds-lineHeight-condensed` | 1.25  | Headings, tight layouts      |
| `--ds-lineHeight-tight`     | 1     | Single-line controls, badges |

### 4.6 — Typography Shorthand Tokens

Each type style bundles size, weight, family, and line-height into a single CSS `font` shorthand:

```css
font: var(--ds-font-heading-large);
/* Resolves to: 600 1.5rem/1.75rem -apple-system, ... */

font: var(--ds-font-body);
/* Resolves to: 400 0.875rem/1.25rem -apple-system, ... */

--ds-font-display: 300 3rem/1.15 var(--ds-font-family-sans);
--ds-font-code: 400 0.8125rem/1 var(--ds-font-family-mono);
```

### 4.7 — Typography Best Practices

- **Smallest allowed size is 11px** (0.6875rem). Avoid using this except for fine print.
- **Heading sequence matters:** Use `<h1>` through `<h6>` in descending order. Heading style and heading level can be decoupled (e.g., `h2` with `heading-large` style) for visual hierarchy.
- **Line length:** Keep body text at 60–80 characters for comfortable reading (roughly `max-w-prose` in Tailwind).
- **Alignment:** Left-align with ragged right edge. Center only for short hero text.
- **Weight for emphasis:** Use `semibold` for headings, `medium` for component text, `regular` for body. Reserve `bold` for exceptional cases.
- **Letter spacing:** Do not alter letter spacing. System fonts handle this natively.
- **Monospace:** Use the mono stack only for code blocks, inline code, and technical identifiers.

### 4.8 — Typography in Tailwind

```html
<!-- Page title -->
<h1 class="text-heading-xxl text-ds-text">Dashboard</h1>

<!-- Body text -->
<p class="text-body text-ds-text-subtle">Welcome back</p>

<!-- Inline code -->
<code class="font-mono text-body-sm bg-ds-surface-sunken px-1 rounded">pnpm dev</code>
```

---

## 5. Size & Spacing

Spacing uses an **8px base unit** system, where `space.100` = 8px. Token names represent the percentage of this base unit. The system also supports a **4px sub-grid** via the `space.050` token for fine-grained control in dense interfaces.

### 5.1 — Space Token Scale

| Token             | Calculation  | Value (px) | Value (rem) |
| ----------------- | ------------ | ---------- | ----------- |
| `--ds-space-0`    | 0% of 8px    | 0px        | 0           |
| `--ds-space-025`  | 25% of 8px   | 2px        | 0.125rem    |
| `--ds-space-050`  | 50% of 8px   | 4px        | 0.25rem     |
| `--ds-space-075`  | 75% of 8px   | 6px        | 0.375rem    |
| `--ds-space-100`  | 100% of 8px  | 8px        | 0.5rem      |
| `--ds-space-150`  | 150% of 8px  | 12px       | 0.75rem     |
| `--ds-space-200`  | 200% of 8px  | 16px       | 1rem        |
| `--ds-space-250`  | 250% of 8px  | 20px       | 1.25rem     |
| `--ds-space-300`  | 300% of 8px  | 24px       | 1.5rem      |
| `--ds-space-400`  | 400% of 8px  | 32px       | 2rem        |
| `--ds-space-500`  | 500% of 8px  | 40px       | 2.5rem      |
| `--ds-space-600`  | 600% of 8px  | 48px       | 3rem        |
| `--ds-space-800`  | 800% of 8px  | 64px       | 4rem        |
| `--ds-space-1000` | 1000% of 8px | 80px       | 5rem        |

### 5.2 — Usage Ranges

The scale divides into three ranges by context:

| Range           | Tokens                     | Pixel Range | Use Case                                       |
| --------------- | -------------------------- | ----------- | ---------------------------------------------- |
| **Compact**     | `space.0` – `space.100`    | 0–8px       | Icon-to-text gaps, inline spacing, tight lists |
| **Comfortable** | `space.150` – `space.300`  | 12–24px     | Component padding, input padding, card gaps    |
| **Spacious**    | `space.400` – `space.1000` | 32–80px     | Section spacing, page margins, layout gaps     |

### 5.3 — Negative Spacing

Negative tokens for pull effects (breaking out of container padding, overlapping elements):

```
--ds-space-negative-025:  -2px
--ds-space-negative-050:  -4px
--ds-space-negative-075:  -6px
--ds-space-negative-100:  -8px
--ds-space-negative-150:  -12px
--ds-space-negative-200:  -16px
--ds-space-negative-300:  -24px
--ds-space-negative-400:  -32px
```

### 5.4 — Control Sizes (T-Shirt Sizing)

Interactive controls (buttons, inputs, selects, checkboxes) follow a t-shirt sizing system for consistent alignment:

| Token                 | Height | Padding (x) | Font Size               | Use Case          |
| --------------------- | ------ | ----------- | ----------------------- | ----------------- |
| `--ds-control-xsmall` | 24px   | `space.075` | `--ds-font-body-xsmall` | Compact toolbars  |
| `--ds-control-small`  | 28px   | `space.100` | `--ds-font-body-small`  | Dense UI          |
| `--ds-control-medium` | 32px   | `space.100` | `--ds-font-body`        | Default (most UI) |
| `--ds-control-large`  | 40px   | `space.200` | `--ds-font-body-large`  | Prominent CTAs    |
| `--ds-control-xlarge` | 48px   | `space.200` | `--ds-font-body-large`  | Touch targets     |

**Medium is always the default.** Only deviate when the context demands it (dense admin UI → small; mobile touch → large/xlarge).

All control-type primitives (Button, Input, Select, etc.) share the same height scale so they align visually when placed side-by-side:

```
┌──────────────────────────────────────────────────────────────┐
│  [Search input: 32px]  [Button: 32px]  [Select: 32px]       │
└──────────────────────────────────────────────────────────────┘
```

### 5.5 — Breakpoints

Viewport-based responsive breakpoints:

| Token                | Value  | Columns | Target                  |
| -------------------- | ------ | ------- | ----------------------- |
| `--ds-breakpoint-sm` | 544px  | 1       | Small phones            |
| `--ds-breakpoint-md` | 768px  | 1–2     | Tablets, large phones   |
| `--ds-breakpoint-lg` | 1012px | 2–3     | Small desktops, tablets |
| `--ds-breakpoint-xl` | 1280px | 3+      | Desktops                |

Note: CSS variables cannot be used in `@media` queries. Use plain pixel values for media queries and the tokens for all other sizing contexts.

### 5.6 — Spacing in Tailwind

The 8px base aligns with Tailwind's default scale (`1` = 4px):

| Token       | Tailwind Class | Value |
| ----------- | -------------- | ----- |
| `space.050` | `p-1`          | 4px   |
| `space.100` | `p-2`          | 8px   |
| `space.150` | `p-3`          | 12px  |
| `space.200` | `p-4`          | 16px  |
| `space.300` | `p-6`          | 24px  |
| `space.400` | `p-8`          | 32px  |
| `space.600` | `p-12`         | 48px  |

For sub-step values (`space.025`, `space.075`, `space.250`), define custom utilities:

```js
spacing: {
  'ds-025': 'var(--ds-space-025)',  // 2px
  'ds-075': 'var(--ds-space-075)',  // 6px
  'ds-250': 'var(--ds-space-250)',  // 20px
}
```

---

## 6. Elevation & Shadows

Elevations are layered surfaces that form the foundation of UI hierarchy. Higher elevations sit closer to the user, creating visual stacking order.

### 6.1 — Surface Levels

Six elevation levels, from lowest to highest:

| Level        | Surface Token          | Shadow Token           | Use Case                                     |
| ------------ | ---------------------- | ---------------------- | -------------------------------------------- |
| **Sunken**   | `--ds-surface-sunken`  | none                   | Backdrop wells (kanban columns, code blocks) |
| **Default**  | `--ds-surface`         | none                   | Page canvas, main content area               |
| **Raised**   | `--ds-surface-raised`  | `--ds-shadow-raised`   | Cards, list items, interactive containers    |
| **Overlay**  | `--ds-surface-overlay` | `--ds-shadow-overlay`  | Dropdowns, popovers, side sheets             |
| **Floating** | `--ds-surface-overlay` | `--ds-shadow-floating` | Modals, dialogs, command palette             |
| **Overflow** | —                      | `--ds-shadow-overflow` | Scroll indicator shadow                      |

### 6.2 — Shadow Token Values

```css
:root,
[data-theme="light"] {
  --ds-shadow-raised: 0px 1px 1px #091e4240, 0px 0px 1px #091e424f;
  --ds-shadow-overlay: 0px 8px 12px #091e4226, 0px 0px 1px #091e424f;
  --ds-shadow-floating: 0px 12px 28px 0 rgba(9, 30, 66, 0.2), 0px 4px 10px 0 rgba(9, 30, 66, 0.1);
  --ds-shadow-overflow: 0px 0px 8px #091e4229, 0px 0px 1px #091e424f;
}

[data-theme="dark"] {
  --ds-shadow-raised: 0px 1px 1px #03040442, 0px 0px 1px #bcd6f00a;
  --ds-shadow-overlay: 0px 8px 12px #0304045c, 0px 0px 1px #bcd6f00a;
  --ds-shadow-floating: 0px 12px 28px 0 rgba(0, 0, 0, 0.5), 0px 4px 10px 0 rgba(0, 0, 0, 0.3);
  --ds-shadow-overflow: 0px 0px 8px #0304045c, 0px 0px 1px #bcd6f00a;
}
```

### 6.3 — Elevation Rules

1. **Always pair matching surface + shadow tokens.** `surface-raised` goes with `shadow-raised`. Never mix levels.
2. **Dark mode relies on surface color differentiation.** Shadows are less visible in dark mode, so raised surfaces become progressively lighter. This is automatic when using tokens.
3. **Sunken only on default surface.** Never apply sunken elevation on raised or overlay surfaces.
4. **Interaction states use surface color changes, not shadow changes.** Use `surface-raised-hovered` and `surface-raised-pressed` for interactive cards — don't transition between shadow levels.

### 6.4 — Sunken vs. Neutral Background

Although `--ds-surface-sunken` and `--ds-background-neutral` may look similar in light mode, they behave differently:

- `surface-sunken` is **opaque** — always darkens in both themes. Use for grouping content (kanban columns, sidebars).
- `background-neutral` is **alpha-based** — adapts to whatever surface it sits on. Use for interactive fills (button backgrounds, hover states).

### 6.5 — Elevation in Tailwind

```html
<!-- Sunken well -->
<div class="bg-ds-surface-sunken rounded-lg p-4">
  <p class="text-ds-text-subtle">Kanban column</p>
</div>

<!-- Raised card -->
<div class="bg-ds-surface-raised shadow-raised rounded-lg p-4">
  <h3 class="text-ds-text font-semibold">Card title</h3>
</div>

<!-- Overlay dropdown -->
<div class="bg-ds-surface-overlay shadow-overlay rounded-lg border border-ds-border p-2">
  Menu content
</div>

<!-- Floating dialog -->
<div class="bg-ds-surface-overlay shadow-floating rounded-xl p-6">
  <h2 class="text-ds-text font-semibold">Dialog content</h2>
</div>
```

---

## 7. Border & Shape

Borders define boundaries and communicate state. Shape tokens control corner rounding for visual consistency.

### 7.1 — Border Width Tokens

| Token                        | Value | Use Case                                   |
| ---------------------------- | ----- | ------------------------------------------ |
| `--ds-border-width`          | 1px   | Default borders, dividers                  |
| `--ds-border-width-selected` | 2px   | Selected state indicator                   |
| `--ds-border-width-focused`  | 2px   | Focus ring thickness                       |
| `--ds-border-width-thick`    | 3px   | Active states, selected tabs (from Primer) |

### 7.2 — Border Radius (Shape) Tokens

| Token               | Value  | Use Case                            |
| ------------------- | ------ | ----------------------------------- |
| `--ds-radius-050`   | 3px    | Small elements (tags, micro badges) |
| `--ds-radius-100`   | 4px    | Default (buttons, inputs, cards)    |
| `--ds-radius-200`   | 8px    | Larger containers, dialogs          |
| `--ds-radius-300`   | 12px   | Prominent cards, hero surfaces      |
| `--ds-radius-400`   | 16px   | Large rounded surfaces              |
| `--ds-radius-round` | 50%    | Circular elements (avatars)         |
| `--ds-radius-pill`  | 9999px | Pill shapes (tags, badges, pills)   |

### 7.3 — Focus Ring

A consistent focus indicator is critical for keyboard accessibility:

```css
.focus-ring:focus-visible {
  outline: none;
  box-shadow: 0 0 0 var(--ds-border-width-focused) var(--ds-border-focused);
}
```

**Rules:**

- Always pair `border-width-focused` with `--ds-border-focused`.
- The focus ring must be visible against both light and dark backgrounds.
- Never remove focus indicators. If the default ring conflicts with your design, restyle it — don't hide it.

### 7.4 — Borders in Tailwind

```js
// packages/config/tailwind/preset.js
borderRadius: {
  'none': '0',
  'sm': 'var(--ds-radius-050)',
  DEFAULT: 'var(--ds-radius-100)',
  'md': 'var(--ds-radius-200)',
  'lg': 'var(--ds-radius-300)',
  'xl': 'var(--ds-radius-400)',
  'full': '9999px',
},
borderColor: {
  DEFAULT: 'var(--ds-border)',
  bold: 'var(--ds-border-bold)',
  focused: 'var(--ds-border-focused)',
  selected: 'var(--ds-border-selected)',
  success: 'var(--ds-border-success)',
  danger: 'var(--ds-border-danger)',
  warning: 'var(--ds-border-warning)',
  attention: 'var(--ds-border-attention)',
  severe: 'var(--ds-border-severe)',
  information: 'var(--ds-border-information)',
  discovery: 'var(--ds-border-discovery)',
}
```

---

## 8. Theming

A theme is a collection of token values designed to achieve a look or style. Switching themes changes every color in the interface simultaneously through a single set of tokens.

### 8.1 — Available Themes

| Theme               | Attribute                          | Description                                              |
| ------------------- | ---------------------------------- | -------------------------------------------------------- |
| Light               | `data-theme="light"`               | Default. White/light surfaces.                           |
| Dark                | `data-theme="dark"`                | Dark surfaces, light text.                               |
| Light High Contrast | `data-theme="light-high-contrast"` | High-contrast light mode for increased readability.      |
| Dark High Contrast  | `data-theme="dark-high-contrast"`  | High-contrast dark mode for increased readability.       |
| System              | Resolved at runtime                | Matches OS preference and resolves to `light` or `dark`. |

### 8.2 — Theme Application

The active theme is set on the `<html>` element:

```html
<html data-theme="light"></html>
```

### 8.3 — Theme Switching Implementation

The Zustand `theme.store.ts` manages theme selection:

```ts
type ThemeMode = "light" | "dark" | "system" | "light-high-contrast" | "dark-high-contrast";

const useThemeStore = create(
  persist(
    (set) => ({
      theme: "system" as ThemeMode,
      setTheme: (theme: ThemeMode) => set({ theme })
    }),
    { name: "theme-preference" }
  )
);
```

The `ThemeProvider` resolves `"system"` by listening to `window.matchMedia('(prefers-color-scheme: dark)')` and applies the final mode (`light`, `dark`, `light-high-contrast`, or `dark-high-contrast`) to `document.documentElement.dataset.theme`.

### 8.4 — Dark Mode Surface Behavior

In dark mode, surfaces at higher elevations become progressively **lighter** (as if lit from the front):

```
Sunken:  #161A1D  (darkest)
Default: #1D2125
Raised:  #22272B  (slightly lighter)
Overlay: #282E33  (lightest)
```

This compensates for the fact that shadows are much harder to see on dark backgrounds. The combination of lighter surface + shadow creates sufficient visual separation.

### 8.5 — High Contrast

High-contrast variants are implemented via `[data-theme="light-high-contrast"]` and `[data-theme="dark-high-contrast"]` layers that override functional tokens to increase contrast ratios. This adjusts scale steps rather than redefining token references.

### 8.6 — Color Vision Deficiency Support (Future Enhancement)

CVD-friendly themes (protanopia/deuteranopia, tritanopia) can be layered by redefining the chromatic base scales — swapping green for blue, red for orange, etc. — while keeping all functional token references unchanged. The scales themselves change, not the semantic mapping.

### 8.7 — Custom Theme Variables

When you need colors beyond the token set, scope them to `data-theme`:

```css
[data-theme="light"] {
  --custom-chart-line: #0747a6;
  --custom-chart-fill: rgba(7, 71, 166, 0.1);
}

[data-theme="dark"] {
  --custom-chart-line: #4c9aff;
  --custom-chart-fill: rgba(76, 154, 255, 0.15);
}
```

Use this sparingly. Prefer official tokens whenever possible.

### 8.8 — Theme Token Values (Light & Dark)

```css
:root,
[data-theme="light"] {
  /* Text */
  --ds-text: #172b4d;
  --ds-text-subtle: #626f86;
  --ds-text-subtlest: #8590a2;
  --ds-text-inverse: #ffffff;
  --ds-text-disabled: #8590a2;
  --ds-text-brand: #0c66e4;
  --ds-text-success: #216e4e;
  --ds-text-danger: #ae2a19;
  --ds-text-warning: #a54800;
  --ds-text-warning-inverse: #172b4d;
  --ds-text-attention: #9a6700;
  --ds-text-severe: #a54800;
  --ds-text-information: #0055cc;
  --ds-text-discovery: #5e4db2;
  --ds-text-open: #5e4db2;
  --ds-text-closed: #ae2a19;
  --ds-text-done: #216e4e;
  --ds-text-selected: #0c66e4;
  --ds-link: #0c66e4;
  --ds-link-pressed: #0055cc;

  /* Icon */
  --ds-icon: #44546f;
  --ds-icon-subtle: #626f86;
  --ds-icon-inverse: #ffffff;
  --ds-icon-disabled: #8590a2;
  --ds-icon-brand: #0c66e4;
  --ds-icon-success: #22a06b;
  --ds-icon-danger: #e34935;
  --ds-icon-warning: #cf9f02;
  --ds-icon-attention: #d4a72c;
  --ds-icon-severe: #cf9f02;
  --ds-icon-information: #1d7afc;
  --ds-icon-discovery: #8270db;
  --ds-icon-open: #8270db;
  --ds-icon-closed: #e34935;
  --ds-icon-done: #22a06b;

  /* Backgrounds */
  --ds-background-default: #ffffff;
  --ds-background-neutral-subtle: #00000000;
  --ds-background-neutral-subtle-hovered: #091e420f;
  --ds-background-neutral: #091e4208;
  --ds-background-neutral-hovered: #091e420f;
  --ds-background-neutral-bold: #44546f;
  --ds-background-brand-bold: #0c66e4;
  --ds-background-brand-bold-hovered: #0055cc;
  --ds-background-success: #dffcf0;
  --ds-background-success-bold: #216e4e;
  --ds-background-danger: #ffedeb;
  --ds-background-danger-bold: #ca3521;
  --ds-background-warning: #fff7d6;
  --ds-background-warning-bold: #e2b203;
  --ds-background-attention: #fff8c5;
  --ds-background-attention-bold: #9a6700;
  --ds-background-severe: #fff1e5;
  --ds-background-severe-bold: #a54800;
  --ds-background-information: #e9f2ff;
  --ds-background-information-bold: #0c66e4;
  --ds-background-discovery: #f3f0ff;
  --ds-background-discovery-bold: #6e5dc6;
  --ds-background-selected: #e9f2ff;
  --ds-background-selected-bold: #0c66e4;
  --ds-background-open: #f3f0ff;
  --ds-background-closed: #ffedeb;
  --ds-background-done: #dffcf0;

  /* Surfaces */
  --ds-surface: #ffffff;
  --ds-surface-sunken: #f7f8f9;
  --ds-surface-raised: #ffffff;
  --ds-surface-raised-hovered: #f7f8f9;
  --ds-surface-raised-pressed: #f1f2f4;
  --ds-surface-overlay: #ffffff;
  --ds-surface-overlay-hovered: #f7f8f9;
  --ds-surface-overlay-pressed: #f1f2f4;

  /* Borders */
  --ds-border: #091e4224;
  --ds-border-bold: #758195;
  --ds-border-focused: #388bff;
  --ds-border-selected: #0c66e4;
  --ds-border-brand: #0c66e4;
  --ds-border-success: #22a06b;
  --ds-border-danger: #e34935;
  --ds-border-warning: #cf9f02;
  --ds-border-attention: #d4a72c;
  --ds-border-severe: #cf9f02;
  --ds-border-information: #1d7afc;
  --ds-border-discovery: #8270db;

  /* Blanket */
  --ds-blanket: #091e427a;
}

[data-theme="dark"] {
  /* Text */
  --ds-text: #b6c2cf;
  --ds-text-subtle: #8c9bab;
  --ds-text-subtlest: #738496;
  --ds-text-inverse: #1d2125;
  --ds-text-disabled: #bfdbf847;
  --ds-text-brand: #579dff;
  --ds-text-success: #4bce97;
  --ds-text-danger: #f87462;
  --ds-text-warning: #f5cd47;
  --ds-text-warning-inverse: #1d2125;
  --ds-text-attention: #d29922;
  --ds-text-severe: #f5cd47;
  --ds-text-information: #579dff;
  --ds-text-discovery: #9f8fef;
  --ds-text-open: #9f8fef;
  --ds-text-closed: #f87462;
  --ds-text-done: #4bce97;
  --ds-text-selected: #579dff;
  --ds-link: #579dff;
  --ds-link-pressed: #85b8ff;

  /* Icon */
  --ds-icon: #8c9bab;
  --ds-icon-subtle: #738496;
  --ds-icon-inverse: #1d2125;
  --ds-icon-disabled: #bfdbf847;
  --ds-icon-brand: #579dff;
  --ds-icon-success: #4bce97;
  --ds-icon-danger: #f87462;
  --ds-icon-warning: #f5cd47;
  --ds-icon-attention: #d29922;
  --ds-icon-severe: #f5cd47;
  --ds-icon-information: #579dff;
  --ds-icon-discovery: #9f8fef;
  --ds-icon-open: #9f8fef;
  --ds-icon-closed: #f87462;
  --ds-icon-done: #4bce97;

  /* Backgrounds */
  --ds-background-default: #1d2125;
  --ds-background-neutral-subtle: #ffffff00;
  --ds-background-neutral-subtle-hovered: #a1bdd914;
  --ds-background-neutral: #a1bdd914;
  --ds-background-neutral-hovered: #a1bdd91f;
  --ds-background-neutral-bold: #9fadbc;
  --ds-background-brand-bold: #579dff;
  --ds-background-brand-bold-hovered: #85b8ff;
  --ds-background-success: #1c3329;
  --ds-background-success-bold: #4bce97;
  --ds-background-danger: #42221f;
  --ds-background-danger-bold: #f87462;
  --ds-background-warning: #332e1b;
  --ds-background-warning-bold: #f5cd47;
  --ds-background-attention: #341a04;
  --ds-background-attention-bold: #d29922;
  --ds-background-severe: #341a04;
  --ds-background-severe-bold: #f5cd47;
  --ds-background-information: #1c2b41;
  --ds-background-information-bold: #579dff;
  --ds-background-discovery: #2b2440;
  --ds-background-discovery-bold: #9f8fef;
  --ds-background-selected: #1c2b41;
  --ds-background-selected-bold: #579dff;
  --ds-background-open: #2b2440;
  --ds-background-closed: #42221f;
  --ds-background-done: #1c3329;

  /* Surfaces */
  --ds-surface: #1d2125;
  --ds-surface-sunken: #161a1d;
  --ds-surface-raised: #22272b;
  --ds-surface-raised-hovered: #282e33;
  --ds-surface-raised-pressed: #2c333a;
  --ds-surface-overlay: #282e33;
  --ds-surface-overlay-hovered: #2c333a;
  --ds-surface-overlay-pressed: #38414a;

  /* Borders */
  --ds-border: #a6c5e229;
  --ds-border-bold: #738496;
  --ds-border-focused: #579dff;
  --ds-border-selected: #579dff;
  --ds-border-brand: #579dff;
  --ds-border-success: #4bce97;
  --ds-border-danger: #f87462;
  --ds-border-warning: #f5cd47;
  --ds-border-attention: #d29922;
  --ds-border-severe: #f5cd47;
  --ds-border-information: #579dff;
  --ds-border-discovery: #9f8fef;

  /* Blanket */
  --ds-blanket: #03040480;
}
```

---

## 9. Primitives (Component Foundations)

Primitives are the atomic building blocks. Built with Radix UI (via shadcn/ui), styled exclusively with design tokens, and completely data-agnostic.

### 9.1 — Primitive Categories

| Category     | Components                                                                                |
| ------------ | ----------------------------------------------------------------------------------------- |
| **Input**    | Button, IconButton, TextInput, TextArea, Select, Checkbox, Radio, Toggle, Slider          |
| **Display**  | Avatar, AvatarGroup, Badge, Lozenge, Tag, Label, Tooltip, Skeleton, Separator, ScrollArea |
| **Overlay**  | Dialog, AlertDialog, Drawer, Sheet, Popup, DropdownMenu, ContextMenu, HoverCard, Blanket  |
| **Layout**   | Card (via elevation), Tabs, Accordion, Collapsible, Stack, Inline                         |
| **Feedback** | Banner, Flag (toast), ProgressBar, Spinner                                                |
| **Form**     | FormField, FormLabel, FormDescription, FormHelperMessage, FormErrorMessage                |
| **Nav**      | SideNavigation, Breadcrumbs, Pagination                                                   |

### 9.2 — Primitive Design Rules

Every primitive follows these rules:

1. **Token-only values.** Zero hardcoded hex, px, or rgb. Every visual property references a `--ds-*` token.
2. **`className` prop.** Every primitive accepts `className` for contextual overrides via `cn()` (clsx + tailwind-merge).
3. **Keyboard accessible.** Radix handles focus management, arrow-key navigation, escape-to-close for all overlay and interactive primitives.
4. **No translation strings.** Primitives accept label text as props. They never import from `@repo/translation` — that is the consumer's responsibility.
5. **Interaction states via tokens.** Use `hovered`, `pressed`, `disabled` token variants — never custom opacity hacks or hardcoded hover colors.
6. **Variant-driven.** Where a primitive has visual variants, they are defined with `class-variance-authority` (CVA).

### 9.3 — Button Anatomy (Example)

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded font-medium transition-colors focus-ring",
  {
    variants: {
      appearance: {
        default: "bg-ds-bg-brand-bold text-ds-text-inverse hover:bg-ds-bg-brand-bold-hovered",
        secondary:
          "bg-ds-bg-neutral-subtle text-ds-text border border-ds-border hover:bg-ds-bg-neutral-subtle-hovered",
        subtle: "bg-ds-bg-neutral-subtle text-ds-text hover:bg-ds-bg-neutral-subtle-hovered",
        ghost: "text-ds-text hover:bg-ds-bg-neutral-subtle-hovered",
        link: "text-[var(--ds-link)] underline-offset-4 hover:underline",
        warning: "bg-ds-bg-warning-bold text-ds-text-warning-inverse hover:opacity-90",
        danger: "bg-ds-bg-danger-bold text-ds-text-inverse hover:bg-ds-bg-danger-bold/90"
      },
      spacing: {
        compact: "h-6 px-2 text-[length:var(--ds-font-body-small)]",
        default: "h-8 px-3 text-[length:var(--ds-font-body)]",
        spacious: "h-10 px-4 text-[length:var(--ds-font-body-large)]"
      }
    },
    defaultVariants: {
      appearance: "default",
      spacing: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, appearance, spacing, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ appearance, spacing }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

Button visual variants are called **"appearance"** and size variants are called **"spacing"** (compact / default / spacious), reflecting the three spacing ranges.

### 9.4 — Lozenge (Status Indicator)

A small status label for communicating state:

| Appearance        | Background Token         | Text Token         |
| ----------------- | ------------------------ | ------------------ |
| Default           | `background.neutral`     | `text`             |
| Success           | `background.success`     | `text.success`     |
| Warning           | `background.warning`     | `text.warning`     |
| Danger            | `background.danger`      | `text.danger`      |
| Information       | `background.information` | `text.information` |
| Discovery         | `background.discovery`   | `text.discovery`   |
| **Bold** variants | `background.{role}.bold` | `text.inverse`     |

### 9.5 — Control Primitives Sizing

All control-type primitives share the same height scale via control tokens (`--ds-control-*`), so they align visually when placed side-by-side. This is enforced by the shared `--ds-control-medium` token (32px).

---

## 10. UI Patterns

UI patterns are compositions of primitives that solve common interface problems. They are opinionated about layout and behavior but remain data-agnostic.

### 10.1 — Modal Dialog

A modal displays content requiring user interaction in a layer above the page.

**Structure:** Header (title + close icon) + Body (scrollable content) + Footer (action buttons).

**Width variants:**

| Size    | Width | Use Case                           |
| ------- | ----- | ---------------------------------- |
| Small   | 400px | Confirmations, simple forms        |
| Medium  | 600px | Standard forms, content review     |
| Large   | 800px | Complex forms, data displays       |
| X-Large | 968px | Wide content, multi-column layouts |

**Behavior:**

- Content determines height. Once a threshold is reached, body scrolls while header/footer remain fixed.
- Users cannot interact with the page behind. A `blanket` (semi-transparent overlay) dims the background.
- Escape closes the dialog. Click on blanket closes the dialog.
- Maximum 2 nested dialogs. The innermost dialog receives focus.
- Center dialogs maintain a 16px safe area from viewport edges.
- Warning modals communicate consequences clearly and offer alternatives.

### 10.2 — Drawer / Side Sheet

A panel that slides in from the side of the screen.

**Variants:**

| Variant     | Position   | Width     | Responsive Fallback  |
| ----------- | ---------- | --------- | -------------------- |
| Right sheet | Right edge | 320–480px | Fullscreen on narrow |
| Left sheet  | Left edge  | 280–320px | Fullscreen on narrow |

**Behavior:**

- Blanket covers the main content.
- Escape or blanket click closes the drawer.
- Content scrolls independently of the page.
- Focus is trapped inside.

### 10.3 — Popup (Popover)

A small overlay anchored to a trigger element.

**Rules:**

- Anchored with automatic flip/shift for viewport edges.
- No blanket (user can still interact with the page).
- Click outside closes the popup.
- Used for: rich tooltips, small forms, quick actions.

### 10.4 — Dropdown Menu / Action Menu

A list of actions/options displayed in an overlay popup.

**Structure:** Trigger button → Popup → ActionList.

**Behavior:**

- Keyboard: arrow keys navigate, Enter/Space selects, Escape closes.
- Supports grouped items with section headers.
- Supports single-select, multi-select, and command (action) items in the same list.
- Destructive items appear at the bottom with danger styling.
- Can contain nested submenus (one level deep).

### 10.5 — Action List

A vertical list of interactive items with consistent single-column format.

**Structure:** Each item can include a leading visual (icon/avatar), label, description, trailing visual (badge/shortcut), and selection indicator (check mark).

**Behavior:**

- Supports single-select (radio), multi-select (checkbox), and command (action) items.
- Items adapt to touch targets on coarse-pointer devices.
- Section headers and dividers group related items.
- Destructive actions appear at the bottom, visually distinguished with `danger` tokens.

### 10.6 — Side Navigation

A vertical navigation component for the sidebar area.

**Structure:** Navigation groups with headers, items (icon + label + optional badge), nested items (expandable sections), and footer actions.

**Behavior:**

- Active item highlighted with `--ds-background-selected` and `--ds-border-selected` left indicator.
- Supports collapsible state (full → icon-only).
- Items adapt to touch targets on mobile.

### 10.7 — Banner

A persistent strip at the top of the page or section for important announcements.

**Variants:** `information` | `warning` | `error` | `announcement`.

Each variant uses the corresponding role's bold background token with inverse text.

### 10.8 — Flag (Toast Notification)

A brief, dismissible notification that appears at the bottom-left of the viewport.

**Variants:** `information` | `success` | `warning` | `error`.

**Behavior:**

- Auto-dismisses after 8 seconds (except errors, which persist).
- Stacks vertically when multiple flags are active.
- Each flag has: icon, title, description (optional), and action link (optional).

### 10.9 — Data Table

A tabular display for structured data (e.g., todos list, members list).

**Features:**

- Column definitions (header label, accessor, width, alignment).
- Sortable columns (click header to toggle asc/desc).
- Row actions (edit, delete via action menu or inline buttons).
- Empty state (illustration + message).
- Loading state (skeleton rows).
- Responsive: on narrow viewports, the table collapses to a card list layout.

### 10.10 — Form Pattern

Forms are composed from primitives and wrapped with `react-hook-form` + Zod validation.

**Structure:** Field groups → FormField → Label + Control + HelperMessage/ErrorMessage.

**Rules:**

- Labels are always visible (no placeholder-only fields).
- Helper text below field for guidance, styled with `--ds-text-subtlest`.
- Error messages replace helper text, styled with `--ds-text-danger`.
- Required fields marked with asterisk, using `--ds-text-danger` color.
- Submit button disabled during submission, showing spinner.
- All text from translation keys — no hardcoded strings.

### 10.11 — Page Layout

**Regions:**

- **Top navigation** — Fixed header bar with product switcher, search, notifications, user menu.
- **Side navigation** — Collapsible sidebar with contextual nav items.
- **Main content** — Scrollable primary content area.
- **Panel (optional)** — Right-side contextual panel for details, settings.

**Responsive:**

| Viewport            | Sidebar            | Panel        | Layout   |
| ------------------- | ------------------ | ------------ | -------- |
| Wide (>1280px)      | Expanded           | Side-by-side | 3-column |
| Medium (768–1280px) | Collapsed (icons)  | Overlay      | 2-column |
| Narrow (<768px)     | Hidden (hamburger) | Full-screen  | 1-column |

---

## 11. Accessibility

Accessibility is built into the token system, component primitives, and UI patterns. It is not an afterthought or add-on.

### 11.1 — Color Contrast

| Context                  | Minimum Ratio | Standard       |
| ------------------------ | ------------- | -------------- |
| Normal text (< 18px)     | 4.5:1         | WCAG 1.4.3 AA  |
| Large text (≥ 18px)      | 3:1           | WCAG 1.4.3 AA  |
| UI components & graphics | 3:1           | WCAG 1.4.11 AA |
| High-contrast themes     | 7:1           | AAA target     |

All `--ds-*` tokens are designed to meet these ratios in both light and dark themes. Accent colors on `subtlest` backgrounds are paired with accent borders to meet the 3:1 non-text contrast requirement.

### 11.2 — Focus Indicators

All interactive elements display `--ds-border-focused` ring on `:focus-visible`. The ring is 2px, colored with the brand accent (blue), visible against all surfaces. Focus is trapped inside open modals and dialogs. On close, focus returns to the trigger.

### 11.3 — Keyboard Navigation

- **Tab order** follows visual order (DOM order matches layout).
- **Arrow keys** navigate within composite widgets (menus, tabs, listboxes).
- **Escape** closes the nearest open overlay.
- **Enter / Space** activates the focused element.

### 11.4 — Color Independence

Color is never the sole communicator of meaning. Every color-coded element is paired with text labels, icons with accessible names, or pattern/shape differences.

### 11.5 — Touch Targets

Minimum touch target: 44×44px (WCAG 2.5.5). The `--ds-control-xlarge` token (48px) is used for primary mobile interactions. Smaller controls may use 32px minimum with adequate spacing between targets.

### 11.6 — Screen Reader Support

- All images and icons have `aria-label` or `aria-hidden="true"` (decorative).
- Form fields are associated with labels via `htmlFor` / `id` pairing.
- Live regions (`aria-live`) announce dynamic content changes (toast notifications, form errors).
- Landmark roles (`<main>`, `<nav>`, `<aside>`) structure the page.
- Heading levels (`<h1>`–`<h6>`) descend sequentially — no skipping levels.

### 11.7 — Motion & Reduced Motion

All animations respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 12. Token Reference Tables

### 12.1 — Color Tokens

```
Text
────────────────────────────────────
--ds-text                    Default body text
--ds-text-subtle             Secondary text
--ds-text-subtlest           Tertiary / placeholder
--ds-text-inverse            On bold backgrounds
--ds-text-disabled           Disabled state
--ds-text-brand              Brand accent text
--ds-text-success            Success text
--ds-text-danger             Danger/error text
--ds-text-warning            Warning text
--ds-text-warning-inverse    On bold warning bg
--ds-text-attention          Attention text
--ds-text-severe             Severe warning text
--ds-text-information        Informational text
--ds-text-discovery          New/discovery text
--ds-text-open               Open workflow state
--ds-text-closed             Closed workflow state
--ds-text-done               Done workflow state
--ds-text-selected           Selected item text
--ds-link                    Hyperlink text
--ds-link-pressed            Hyperlink pressed

Icon
────────────────────────────────────
--ds-icon                    Default icon
--ds-icon-subtle             Secondary icon
--ds-icon-inverse            On bold backgrounds
--ds-icon-disabled           Disabled state
--ds-icon-brand              Brand icon
--ds-icon-success            Success icon
--ds-icon-danger             Danger icon
--ds-icon-warning            Warning icon
--ds-icon-attention          Attention icon
--ds-icon-severe             Severe icon
--ds-icon-information        Information icon
--ds-icon-discovery          Discovery icon
--ds-icon-open               Open workflow icon
--ds-icon-closed             Closed workflow icon
--ds-icon-done               Done workflow icon

Background
────────────────────────────────────
--ds-background-default
--ds-background-neutral-subtle(-hovered / -pressed)
--ds-background-neutral(-hovered / -pressed)
--ds-background-neutral-bold(-hovered / -pressed)
--ds-background-brand-bold(-hovered / -pressed)
--ds-background-selected(-hovered / -pressed)
--ds-background-selected-bold(-hovered / -pressed)
--ds-background-{role}                  (subtlest tint)
--ds-background-{role}-bold(-hovered)   (strong fill)
  where {role} = success | danger | warning | attention | severe | information | discovery
--ds-background-open
--ds-background-closed
--ds-background-done

Border
────────────────────────────────────
--ds-border                  Default border/divider
--ds-border-bold             Strong border
--ds-border-focused          Focus ring
--ds-border-selected         Selected indicator
--ds-border-brand            Brand border
--ds-border-{role}           Semantic role borders
  where {role} = success | danger | warning | attention | severe | information | discovery

Surface
────────────────────────────────────
--ds-surface                 Default page surface
--ds-surface-sunken          Recessed well
--ds-surface-raised(-hovered / -pressed)
--ds-surface-overlay(-hovered / -pressed)

Shadow
────────────────────────────────────
--ds-shadow-raised           Cards, raised containers
--ds-shadow-overlay          Dropdowns, popovers
--ds-shadow-floating         Modals, dialogs
--ds-shadow-overflow         Scroll indicators

Blanket
────────────────────────────────────
--ds-blanket                 Modal/dialog backdrop
--ds-blanket-selected        Selection overlay
```

### 12.2 — Space Tokens

```
--ds-space-0      0px
--ds-space-025    2px
--ds-space-050    4px
--ds-space-075    6px
--ds-space-100    8px   (base unit)
--ds-space-150    12px
--ds-space-200    16px
--ds-space-250    20px
--ds-space-300    24px
--ds-space-400    32px
--ds-space-500    40px
--ds-space-600    48px
--ds-space-800    64px
--ds-space-1000   80px

Negatives:
--ds-space-negative-025  -2px
--ds-space-negative-050  -4px
--ds-space-negative-075  -6px
--ds-space-negative-100  -8px
--ds-space-negative-150  -12px
--ds-space-negative-200  -16px
--ds-space-negative-300  -24px
--ds-space-negative-400  -32px

Control Sizes:
--ds-control-xsmall   24px
--ds-control-small    28px
--ds-control-medium   32px  ← default
--ds-control-large    40px
--ds-control-xlarge   48px

Breakpoints:
--ds-breakpoint-sm    544px
--ds-breakpoint-md    768px
--ds-breakpoint-lg    1012px
--ds-breakpoint-xl    1280px
```

### 12.3 — Typography Tokens

```
Headings (font shorthand)
────────────────────────────────────
--ds-font-heading-display   300 48px/56px
--ds-font-heading-xxlarge   600 35px/40px
--ds-font-heading-xlarge    600 29px/32px
--ds-font-heading-large     600 24px/28px
--ds-font-heading-medium    500 20px/24px
--ds-font-heading-small     600 16px/20px
--ds-font-heading-xsmall    600 14px/16px
--ds-font-heading-xxsmall   600 12px/16px

Body (font shorthand)
────────────────────────────────────
--ds-font-body-large        400 16px/24px
--ds-font-body              400 14px/20px   (default)
--ds-font-body-small        400 12px/18px
--ds-font-body-xsmall       400 11px/16px

Code
────────────────────────────────────
--ds-font-code              400 relative/1

Weights
────────────────────────────────────
--ds-font-weight-light      300
--ds-font-weight-regular    400
--ds-font-weight-medium     500
--ds-font-weight-semibold   600
--ds-font-weight-bold       700

Line Heights
────────────────────────────────────
--ds-lineHeight-default     1.5
--ds-lineHeight-condensed   1.25
--ds-lineHeight-tight       1

Families
────────────────────────────────────
--ds-font-family-sans       System sans-serif stack
--ds-font-family-mono       System monospace stack
```

### 12.4 — Border & Shape Tokens

```
Width
────────────────────────────────────
--ds-border-width            1px (default)
--ds-border-width-selected   2px
--ds-border-width-focused    2px
--ds-border-width-thick      3px

Radius
────────────────────────────────────
--ds-radius-050    3px
--ds-radius-100    4px   (default)
--ds-radius-200    8px
--ds-radius-300    12px
--ds-radius-400    16px
--ds-radius-round  50%
--ds-radius-pill   9999px
```

---

## Appendix: Tailwind Preset Structure

The complete Tailwind preset that maps all tokens lives at `packages/config/tailwind/preset.js`:

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        "ds-text": {
          /* all --ds-text-* tokens */
        },
        "ds-bg": {
          /* all --ds-background-* tokens */
        },
        "ds-border": {
          /* all --ds-border-* tokens */
        },
        "ds-surface": {
          /* all --ds-surface-* tokens */
        },
        "ds-icon": {
          /* all --ds-icon-* tokens */
        },
        "ds-link": { DEFAULT: "var(--ds-link)", pressed: "var(--ds-link-pressed)" },
        "ds-blanket": { DEFAULT: "var(--ds-blanket)" }
      },
      fontFamily: {
        sans: "var(--ds-font-family-sans)",
        mono: "var(--ds-font-family-mono)"
      },
      fontSize: {
        "heading-display": ["3rem", { lineHeight: "1.15" }],
        "heading-xxl": ["2.1875rem", { lineHeight: "1.14" }],
        "heading-xl": ["1.8125rem", { lineHeight: "1.1" }],
        "heading-lg": ["1.5rem", { lineHeight: "1.17" }],
        "heading-md": ["1.25rem", { lineHeight: "1.2" }],
        "heading-sm": ["1rem", { lineHeight: "1.25" }],
        "heading-xs": ["0.875rem", { lineHeight: "1.14" }],
        "heading-xxs": ["0.75rem", { lineHeight: "1.33" }],
        "body-lg": ["1rem", { lineHeight: "1.5" }],
        body: ["0.875rem", { lineHeight: "1.43" }],
        "body-sm": ["0.75rem", { lineHeight: "1.5" }],
        "body-xs": ["0.6875rem", { lineHeight: "1.45" }]
      },
      fontWeight: {
        light: "var(--ds-font-weight-light)",
        regular: "var(--ds-font-weight-regular)",
        medium: "var(--ds-font-weight-medium)",
        semibold: "var(--ds-font-weight-semibold)",
        bold: "var(--ds-font-weight-bold)"
      },
      lineHeight: {
        default: "var(--ds-lineHeight-default)",
        condensed: "var(--ds-lineHeight-condensed)",
        tight: "var(--ds-lineHeight-tight)"
      },
      borderRadius: {
        none: "0",
        sm: "var(--ds-radius-050)",
        DEFAULT: "var(--ds-radius-100)",
        md: "var(--ds-radius-200)",
        lg: "var(--ds-radius-300)",
        xl: "var(--ds-radius-400)",
        full: "9999px"
      },
      borderColor: {
        DEFAULT: "var(--ds-border)",
        bold: "var(--ds-border-bold)",
        focused: "var(--ds-border-focused)",
        selected: "var(--ds-border-selected)",
        brand: "var(--ds-border-brand)",
        success: "var(--ds-border-success)",
        danger: "var(--ds-border-danger)",
        warning: "var(--ds-border-warning)",
        attention: "var(--ds-border-attention)",
        severe: "var(--ds-border-severe)",
        information: "var(--ds-border-information)",
        discovery: "var(--ds-border-discovery)"
      },
      boxShadow: {
        raised: "var(--ds-shadow-raised)",
        overlay: "var(--ds-shadow-overlay)",
        floating: "var(--ds-shadow-floating)",
        overflow: "var(--ds-shadow-overflow)",
        none: "none"
      },
      spacing: {
        "ds-025": "var(--ds-space-025)",
        "ds-050": "var(--ds-space-050)",
        "ds-075": "var(--ds-space-075)",
        "ds-100": "var(--ds-space-100)",
        "ds-150": "var(--ds-space-150)",
        "ds-200": "var(--ds-space-200)",
        "ds-250": "var(--ds-space-250)",
        "ds-300": "var(--ds-space-300)",
        "ds-400": "var(--ds-space-400)",
        "ds-500": "var(--ds-space-500)",
        "ds-600": "var(--ds-space-600)",
        "ds-800": "var(--ds-space-800)",
        "ds-1000": "var(--ds-space-1000)"
      }
    }
  }
};
```

---

**This document is the unified reference specification for the design system.** All components in `@repo/ui`, all application styling, and all platform-specific adaptations (NativeWind for mobile, Tauri webview for desktop) should derive their visual values from the `--ds-*` tokens defined here.
