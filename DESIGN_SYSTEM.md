# Design System

This document is the visual authority for Kaine Forge. It defines the token model, theme rules, component styling expectations, accessibility baseline, and the split between web/desktop UI and mobile UI. For architecture, package boundaries, data flow, and engineering conventions, use `MONOREPO_GUIDE.md`.

The look of a theme lives in its own `DESIGN.md` (the default theme: `packages/theme/src/themes/byte-forge/DESIGN.md`, copied to the root `DESIGN.md`). Start with `docs/ui/README.md`. The rules with IDs are in `docs/ui/guidelines.md`, the steps to build a theme in `docs/ui/create-a-theme.md`, the review list in `docs/ui/quality-checklist.md`, and the product rules of the template's own screens in `docs/ui/workspaces.md`.

<!-- TEMPLATE_POLICY_BLOCK_START -->

Kaine Forge is a boilerplate template. This design system defines current default patterns for new products, not compatibility promises for old visual conventions.

When adopting this template for a product repository, remove this `TEMPLATE_POLICY_BLOCK` and replace it with your product design compatibility policy.

<!-- TEMPLATE_POLICY_BLOCK_END -->

## 1. Principles

- Token-first: choose tokens by semantic meaning, not by visual resemblance.
- Practical: UI should be calm, efficient, and task-focused.
- Consistent: shared foundations should make components predictable across apps.
- Accessible by default: color, focus, keyboard navigation, and content structure must be usable without after-the-fact fixes.
- Adaptable: the system must work across light/dark themes, browser, Tauri webview, and React Native mobile surfaces.
- Intentional: before UI work, identify the audience, task, tone, constraints, and one product-specific design choice that prevents the interface from feeling generic.
- Domain-fit: SaaS, admin, and operational tools should favor dense, scannable, work-focused layouts; more expressive composition belongs only where the product domain calls for it.

## 2. Platform Split

Kaine Forge has two UI packages because web/desktop and mobile have different runtimes.

| Surface               | Package           | Runtime      | Styling pipeline                                       |
| --------------------- | ----------------- | ------------ | ------------------------------------------------------ |
| Web, desktop, desk UI | `@repo/ui`        | React DOM    | Tailwind CSS v4, Radix, generated theme utilities      |
| Mobile                | `@repo/mobile-ui` | React Native | NativeWind, Tailwind CSS v3-compatible mobile pipeline |

Rules:

- Use `@repo/ui` only in React DOM code: web, desktop, and the agent desk UI (`tooling/desk-ui`).
- Use `@repo/mobile-ui` only in React Native code.
- Keep component APIs similar where useful, but do not force DOM-specific primitives into mobile.
- Shared visual decisions come from the same `--ds-*` token vocabulary.

### 2.1 Intentional mobile-ui subset

`@repo/mobile-ui` is a **platform-appropriate subset**, not a 1:1 port of `@repo/ui`.

- **In scope for mobile-ui:** layout/content primitives used by Expo screens (text, button, input, card, dialog, checkbox, badge, avatar, skeleton, separator) plus NativeWind helpers.
- **Out of scope for mobile-ui by default:** web/desktop-only patterns (sidebar shell, complex data tables, Radix-heavy overlays, shadcn portfolio components).
- **Shared behavior that is not UI chrome** (auth field rules, org scope helpers, API clients) belongs in domain packages such as `@repo/auth`, not in either UI kit.
- Grow mobile-ui when a real mobile screen needs a primitive; do not bulk-copy web components “for parity.”

## 3. Token Architecture

Tokens are the public design API. Components should consume functional tokens instead of raw values.

### 3.1 Token Tiers

| Tier              | Purpose                                                   | Example                                         |
| ----------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Theme values      | the colors and scales a theme defines, in TypeScript only | `byteForgeTheme.modes.light.surface`            |
| Functional tokens | semantic UI values, primary consumer API                  | `--ds-text`, `--ds-background-danger-bold`      |
| Component tokens  | component or pattern-specific values                      | `--ds-button-radius`, `--ds-card-shadow` (§6.1) |

Theme values exist only in `@repo/theme`; code never reads them directly. Functional tokens are the default choice.

### 3.2 Token Foundations

| Foundation | Prefix examples                                               |
| ---------- | ------------------------------------------------------------- |
| Text       | `--ds-text`, `--ds-text-subtle`, `--ds-text-danger`           |
| Icon       | `--ds-icon`, `--ds-icon-subtle`, `--ds-icon-danger`           |
| Background | `--ds-background-default`, `--ds-background-brand-bold`       |
| Border     | `--ds-border`, `--ds-border-focused`, `--ds-border-danger`    |
| Surface    | `--ds-surface`, `--ds-surface-raised`, `--ds-surface-overlay` |
| Shadow     | `--ds-shadow-raised`, `--ds-shadow-overlay`                   |
| Spacing    | `--ds-space-100`, `--ds-space-200`                            |
| Typography | `--ds-font-body`, `--ds-font-heading-large`                   |
| Shape      | `--ds-radius-100`, `--ds-radius-200`                          |

### 3.3 Naming

Functional tokens follow:

```text
--ds-{foundation}-{role?}-{emphasis?}-{state?}
```

Examples:

```text
--ds-text
--ds-text-subtle
--ds-text-inverse
--ds-background-neutral-hovered
--ds-background-success-bold
--ds-border-focused
--ds-surface-raised
--ds-space-200
```

### 3.4 Emphasis

Use emphasis to control contrast:

| Level      | Use                                           |
| ---------- | --------------------------------------------- |
| `subtlest` | quiet background tint                         |
| `subtle`   | stronger tint or subdued foreground           |
| default    | normal foreground/background role             |
| `bold`     | strong fill, usually paired with inverse text |

Text on bold backgrounds must use inverse tokens when contrast requires it. Text and icons on brand and selected bold fills use `--ds-text-brand-inverse`, not `--ds-text-inverse`. The theme picks white or ink for the brand fill and keeps it in both modes, while `--ds-text-inverse` flips with the mode. Hovered and pressed fills move away from their text, so the text keeps its contrast.

## 4. Color Rules

The active theme sets every color; its `DESIGN.md` describes the palette. Components use the roles below and never a raw value, so the same screen works in every theme and mode. `pnpm theme:check` and the `@repo/theme` tests measure every text, control, and chart color pair in both modes of every registered theme against the WCAG 2.2 AA baseline in §12.

Semantic roles:

| Role        | Meaning                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| Neutral     | default chrome, text, dividers                                                              |
| Brand       | primary actions and product identity                                                        |
| Information | help, guidance, neutral notices                                                             |
| Success     | positive outcome or completion                                                              |
| Warning     | caution or pending risk                                                                     |
| Danger      | errors or destructive actions                                                               |
| Discovery   | onboarding, new features, exploration                                                       |
| Chart       | `--ds-chart-1` to `--ds-chart-6` for data series in order, `--ds-chart-grid` for grid lines |
| Chart tint  | `--ds-background-chart-1` to `-6` for pale fills, `--ds-text-chart-1` to `-6` for text      |

Rules:

- Never use color as the only communicator. Pair it with text, iconography, shape, or state labels.
- Use tokenized interaction states such as `hovered`, `pressed`, `focused`, and `disabled`.
- Do not use opacity hacks, `filter`, or custom hover colors for interaction states in components.
- Do not hardcode hex, rgb, hsl, or named colors in component code.
- A category tile, tag, or avatar takes its chart color's tint (`bg-ds-bg-chart-2`), not the chart color at an opacity. The tint carries `text`, `text-subtle`, and its text color (`text-ds-text-chart-2`), which also draws an icon or a mark on the tint; the text color reads on every surface too (COLOR-7).

## 5. Typography

Typography tokens define hierarchy and rhythm.

| Token                      | Use                 |
| -------------------------- | ------------------- |
| `--ds-font-display`        | one hero figure     |
| `--ds-font-heading-xlarge` | page heading        |
| `--ds-font-heading-large`  | section heading     |
| `--ds-font-heading-medium` | card/panel heading  |
| `--ds-font-heading-small`  | compact heading     |
| `--ds-font-body-large`     | prominent body text |
| `--ds-font-body`           | default body text   |
| `--ds-font-body-small`     | supporting text     |
| `--ds-font-body-xsmall`    | metadata            |

Reading-first workspaces, such as the agent desk, use a larger, airier scale: `--ds-font-body-comfortable` (15px/1.55) for body text, `--ds-font-body-snug` (13.5px) for secondary text such as tables and status bars, `--ds-font-body-compact` (13px) for metadata, `--ds-font-code-small` (12.5px) for code, `--ds-font-heading-row` (15.5px) for list row titles, `--ds-font-heading-card` (19px) for card headings and key figures, and `--ds-font-heading-page` (26px) for the page title. Their headings use `--ds-letter-spacing-heading` (-0.015em). Every step has a `text-*` utility, so a dense table or nav that needs 13px text uses `text-body-compact`, not a changed `body` step.

Each step also has a letter-spacing token, `--ds-letter-spacing-<step>`, which its `text-*` utility sets and `tracking-*` still overrides. It is 0 unless the theme sets it: `letterSpacing` in `createTheme` for every step, or `letterSpacing` on one step in `type`, for example to narrow a wide font.

The theme sets the families: `--ds-font-family-sans`, `--ds-font-family-heading`, and `--ds-font-family-mono`. Web fonts are self-hosted from `@repo/ui`, so desktop works offline; mobile registers its fonts with `expo-font` and takes them from the theme's native fonts. The default theme, Byte Forge, uses Geist and Geist Mono.

Rules:

- Do not scale font size with viewport width.
- Letter spacing comes from the type step's token, or a documented tokenized exception.
- Keep heading order semantic and sequential.
- User-facing text must come from translation keys in app code.

## 6. Spacing, Size, and Shape

Spacing follows an 8px base unit with smaller 2px and 4px steps for dense layouts.

| Token            | Value |
| ---------------- | ----- |
| `--ds-space-025` | 2px   |
| `--ds-space-050` | 4px   |
| `--ds-space-075` | 6px   |
| `--ds-space-100` | 8px   |
| `--ds-space-150` | 12px  |
| `--ds-space-200` | 16px  |
| `--ds-space-300` | 24px  |
| `--ds-space-400` | 32px  |
| `--ds-space-600` | 48px  |
| `--ds-space-800` | 64px  |

Control sizes:

| Token                 | Height | Use                   |
| --------------------- | ------ | --------------------- |
| `--ds-control-xsmall` | 24px   | compact toolbars      |
| `--ds-control-small`  | 28px   | dense UI              |
| `--ds-control-medium` | 32px   | web buttons           |
| `--ds-control-large`  | 40px   | web fields, selects   |
| `--ds-control-xlarge` | 48px   | mobile/touch controls |

Shape:

| Token              | Value  | Use                                               |
| ------------------ | ------ | ------------------------------------------------- |
| `--ds-radius-050`  | 4px    | badges, tags, checkboxes                          |
| `--ds-radius-100`  | 8px    | inputs, selects, menu items, list rows            |
| `--ds-radius-200`  | 12px   | menus, popovers, panels                           |
| `--ds-radius-250`  | 16px   | agent desk cards and panels                       |
| `--ds-radius-300`  | 20px   | cards, dialogs, sheets                            |
| `--ds-radius-pill` | 9999px | buttons, icon buttons, toggles, pagination, pills |

Rules:

- Components take their shape from the component tokens in §6.1, so a theme can change it in one place. Agent desk cards use `--ds-radius-250`. Do not invent radii between the steps.
- Use stable dimensions for grids, boards, toolbars, counters, icon buttons, and fixed-format UI.
- Avoid layout shift when labels, loading states, badges, or hover states change.

### 6.1 Component tokens

Component tokens are the per-component values a theme sets for shape, density, and depth. Each one has a utility. The Byte Forge values are:

| Token                     | Byte Forge                  | Utility                  | Use                                                                    |
| ------------------------- | --------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `--ds-button-radius`      | `--ds-radius-pill`          | `rounded-button`         | buttons                                                                |
| `--ds-button-font-weight` | `--ds-font-weight-semibold` | `font-button`            | button labels                                                          |
| `--ds-field-radius`       | `--ds-radius-100`           | `rounded-field`          | inputs, selects, textareas                                             |
| `--ds-field-border`       | `--ds-border-bold`          | `border-ds-field-border` | field borders; must reach 3:1 against the surface (WCAG 2.2 SC 1.4.11) |
| `--ds-card-radius`        | `--ds-radius-300`           | `rounded-card`           | cards, stat cards, the sign-in card                                    |
| `--ds-card-padding`       | `--ds-space-200`            | `p-card`                 | card padding                                                           |
| `--ds-card-shadow`        | `--ds-shadow-raised`        | `shadow-card`            | card elevation; `none` gives a flat, border-only theme                 |
| `--ds-overlay-radius`     | `--ds-radius-200`           | `rounded-overlay`        | menus, popovers, select lists                                          |
| `--ds-dialog-radius`      | `--ds-radius-300`           | `rounded-dialog`         | dialogs and the command menu                                           |
| `--ds-badge-radius`       | `--ds-radius-pill`          | `rounded-badge`          | badges                                                                 |

## 7. Elevation

Surface and shadow levels must match.

| Level    | Surface token          | Shadow token           | Use                         |
| -------- | ---------------------- | ---------------------- | --------------------------- |
| default  | `--ds-surface`         | none                   | normal page/card surface    |
| raised   | `--ds-surface-raised`  | `--ds-shadow-raised`   | cards and raised containers |
| overlay  | `--ds-surface-overlay` | `--ds-shadow-overlay`  | dropdowns/popovers          |
| floating | `--ds-surface-overlay` | `--ds-shadow-floating` | dialogs/modals              |
| sunken   | `--ds-surface-sunken`  | none                   | recessed wells              |
| glow     | the brand fill         | `--ds-shadow-glow`     | one brand element at a time |

Do not pair `surface-raised` with `shadow-overlay` or default surface with raised shadow unless a documented component token says so.

In dark mode a shadow barely shows, so lightness carries the levels: a card stands at least 1.1:1 above the page and a sunken canvas, and the theme check measures it. `--ds-shadow-glow` is a soft glow in the brand fill color, such as under the current navigation pill. Light mode casts it below the element; dark mode spreads it evenly, a little stronger. A theme tunes it or turns it off with `glow`.

### Motion contract

Use CSS on web/desktop and Reanimated on native. Do not add an animation framework. Canonical duration tokens are `--ds-motion-control` (120ms), `--ds-motion-overlay` (180ms), and `--ds-motion-drawer` (220ms). On web, use them through `duration-control`, `duration-overlay`, `duration-drawer`, and `ease-standard`, with a named property: `transition-colors duration-control ease-standard`. Use small opacity/transform transitions, respect reduced motion, and never delay navigation. Theme changes are immediate and preserve drafts, focus, and scroll.

- Use `--ds-motion-easing` (a quick ease-out, `cubic-bezier(0.23, 1, 0.32, 1)`) for calm transitions without bounce. Sidebar rail and spacer resize together while labels fade; interrupted width transitions reverse from the current geometry. Footer preferences stay in fixed vertical slots above a stable-height profile row.
- Sheets enter and exit fully from their declared edge. Backdrops fade. Dialogs combine opacity with `--ds-motion-distance-dialog` (8px); anchored menus/tooltips use `--ds-motion-distance-menu` (4px). Preserve positioning transforms. Radix owns exit presence and focus restoration.
- Attachment disclosures interpolate intrinsic content height with CSS grid. Keep their upload controls mounted; closed content is inert and becomes hidden after collapse. Do not animate message streams, list staggering, or route entry.
- Enabled buttons scale to `--ds-motion-press-scale` (0.97) for press feedback. Native buttons scale their visible surface inside a stable touch target and preserve caller styles and refs. Focus indicators remain immediate.
- Native dialogs use Reanimated timing with generated durations/easing/distances. Keep content mounted through exit, cancel interrupted animations, and ignore stale exit completions after reopening. Existing explicit `animationType="none"` disables motion; `slide` retains a full-height slide.
- Follow device reduced motion, including runtime changes. Remove motion immediately rather than adding an app override. The native drawer keeps its clamped gesture animation, with a pnpm patch replacing its explicit reduced-motion opt-out in both source and compiled module. Remove that patch when the upstream package honors the system preference itself.
- Test intermediate browser geometry and entry/exit lifetimes, not only final screenshots. Keep short motion recordings for review. Bundle exports cannot verify physical-device motion or accessibility.

## 8. Theming

A **theme** is a named identity, such as `byte-forge`. A **color mode** is light or dark; the stored preference can also be `system`. Two attributes on the root element select them:

| Attribute         | Values                  | Set by                                                 |
| ----------------- | ----------------------- | ------------------------------------------------------ |
| `data-theme`      | a registered theme name | the Organization Theme; none means the default theme   |
| `data-color-mode` | `light`, `dark`         | the Appearance preference, resolved before first paint |

An unknown or missing `data-theme` falls back to the default theme through `:root`. The Tailwind `dark:` variant follows `data-color-mode`. Users see the color mode as **Appearance**.

Themes live in `@repo/theme`, one folder each under `packages/theme/src/themes/`, and `themes.config.ts` registers them and names the default. A theme is data: colors for both modes, the scales, the type steps, the component tokens (§6.1), and the mobile fonts. `createTheme` derives a full theme from a brand color, a neutral tint, fonts, density, and depth; `docs/ui/create-a-theme.md` walks through it.

The **Organization Theme** picks the theme for everyone in an Organization (`CONTEXT.md`). Members with `organization:update` change it in Organization settings. The web shell applies it as `data-theme` and caches it for the next first paint; mobile applies it through `ThemeRoot`. Signed-out pages use the default theme.

A subtree can carry its own theme: put `data-theme` and `data-color-mode` on the same element, as the UI lab does to compare themes side by side.

Rules:

- Do not branch component code on theme when a token can express the difference.
- New theme values should redefine tokens, not component internals.
- No secrets or runtime environment values belong in theme files.
- Use `prefers-reduced-motion` protections for motion-heavy patterns.
- Use motion to clarify orientation, feedback, or state transitions. Prefer a few deliberate transitions over scattered effects.

## 9. Web/Desktop Styling

`@repo/ui` owns React DOM primitives and composed components.

Themes live in `@repo/theme` (`packages/theme/src/themes/<name>/<name>.theme.ts`). `pnpm theme:build` writes `packages/ui/src/styles/tokens.generated.css`: the `--ds-*` tokens and the Tailwind v4 utilities that read them. `globals.css` imports it. Use the utilities, not arbitrary values: `bg-ds-surface-raised`, not `bg-[var(--ds-surface-raised)]`. The utilities replace the default Tailwind palette, shadows, radii, and type sizes, so `bg-red-500`, `shadow-sm`, `rounded`, and `text-sm` generate no CSS; the `ui/no-reset-default` lint rule reports them. Component CSS sits in `@layer components` and element defaults in `@layer base`, so a utility in `className` always wins over them.

| Utility                                                | Reads                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `text-ds-text-subtle`, `text-ds-icon`, `text-ds-link`  | text, icon, and link colors                                              |
| `bg-ds-surface-raised`, `bg-ds-bg-neutral-hovered`     | surfaces and backgrounds (`--ds-background-*` becomes `ds-bg-*`)         |
| `border-ds-border`, `ring-ds-border-focused`           | border colors                                                            |
| `p-ds-200`, `gap-ds-100`, `h-ds-control-medium`        | `--ds-space-*` and `--ds-control-*`                                      |
| `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl` | `--ds-radius-050`, `-100`, `-200`, `-300`                                |
| `shadow-raised`, `shadow-overlay`, `shadow-glow`       | `--ds-shadow-*`                                                          |
| `text-display`, `text-heading-sm`, `text-body-compact` | the whole `--ds-font-*` step and its `--ds-letter-spacing-*` (section 5) |
| `rounded-card`, `shadow-card`, `p-card`, `font-button` | the component tokens (section 6.1)                                       |
| `duration-control`, `ease-standard`                    | `--ds-motion-*` durations and easing                                     |

`packages/config/tailwind/preset.js` gives mobile (NativeWind) the same utility names from the generated `preset.tokens.js`.

Web app global styles should stay minimal and app-shell oriented. Feature components should prefer `@repo/ui` primitives and token utilities over custom CSS.

Primitive rules:

- Data-agnostic and prop-driven.
- Accept `className` for contextual layout overrides.
- Labels/content are passed by consumers; primitives do not import translations.
- Keyboard accessibility is provided by native elements or Radix primitives.
- Variants use CVA or the local established variant helper.
- Interaction states use token variants.

Composed component rules:

- Do not import app stores or app route hooks.
- Accept data and callbacks through props.
- Keep business logic in app features, adapters, or hooks.

## 10. Mobile Styling

`@repo/mobile-ui` owns React Native primitives and mobile variants.

### Token pipeline (single source of truth)

Themes in `@repo/theme` are the only token source. Mobile does **not** hand-maintain a second hex palette. The same generator emits `packages/mobile-ui/src/lib/design-tokens.ts` for native navigation colors and motion durations; consume its public `@repo/mobile-ui` exports for APIs that require concrete runtime values.

Pipeline:

1. Edit a theme in `packages/theme/src/themes/`.
2. Run `pnpm theme:build`. It checks contrast, then writes the web tokens, the marked region in `apps/mobile/src/styles/global.css`, the native tokens, and the NativeWind preset tokens.
3. `pnpm theme:check` and the `@repo/theme` tests fail when a theme fails contrast or a generated file is out of date.

The generated block is bounded by `/* DESIGN_TOKENS_START */` / `/* DESIGN_TOKENS_END */`. Functional color tokens are resolved to concrete values because NativeWind does not chase nested `var()` chains the way web CSS does. Theme-independent structural tokens (`--ds-space-*`, `--ds-radius-*`, font weights, line heights, control sizes) are included on `:root`. Dark theme overrides land under `.dark` (paired with the mobile dark-theme class wiring).

Mobile runtime wiring:

- `apps/mobile/src/styles/global.css` — generated token CSS + NativeWind entry
- `apps/mobile/tailwind.config.ts`
- `packages/mobile-ui/src/lib/variants.ts`

Rules:

- Use mobile primitives from `@repo/mobile-ui` for reusable controls.
- Use `--ds-*` token vocabulary where NativeWind supports it.
- Keep touch targets at least 44px where possible; use `xlarge` for primary mobile actions.
- Do not copy DOM-specific Radix/shadcn APIs into mobile components.
- Keep mobile component text passed by props or translations from app feature code.
- Avoid raw color and spacing values in mobile feature components.
- After changing a theme, run `pnpm theme:build` before committing.

## 11. Layout Patterns

Use full-width sections or app-shell regions for page structure. Cards are for individual repeated items, dialogs, or clearly framed controls. Do not put cards inside cards.

Composition rules:

- Start with the workflow shape: navigation, primary task, supporting context, and secondary actions.
- Avoid generic stacks of floating cards when a tighter app shell, table, split view, toolbar, or full-width section communicates the task better.
- Use asymmetry, contrast, or distinctive structure only when it improves hierarchy, scanning, or product character.
- Keep app and tool screens usable first. Landing-page treatment, oversized hero typography, and decorative storytelling do not belong in routine workflow surfaces.

Common patterns:

- App shell: header, sidebar/drawer, main content.
- Dialog/modal: focus-trapped, escape-close, focus returns to trigger. `Modal`, `AlertDialogContent`, and `SheetContent` return focus to the element that opened them, also without a Radix trigger. A dialog opened from a menu item returns focus to the menu's trigger, or for a context menu to the element focused before the menu opened.
- Popover/menu: keyboard navigable, touch-friendly spacing.
- Banner/flag: semantic role color plus text/icon.
- Data table: semantic headers, loading skeletons, empty state, responsive fallback.
- Form: visible labels, helper/error text, disabled pending state, translated strings.

### 11.1 Composed page parts

`@repo/ui` ships these composed parts. They take translated text from the caller and import no translations.

- `PageHeader`: the page's only `h1`, with an optional eyebrow, description, and right-aligned `actions`. Every shell page starts with it.
- `EmptyState`: a quiet panel for a list with no items. Give it a title, an optional description and icon, and one `action` that starts the first item.
- `QueryError`: a `role="alert"` message with a retry button. Use it for every failed read, beside the data that failed. Do not use it for a failed write; keep that error beside its action.
- `SettingsSection`: a flat, full-width block with a title, an optional description, and `actions`. A divider separates consecutive sections. Do not wrap a section in a Card.
- `StatCard`: a label and a value, with an optional decorative `icon`, a `delta` badge (its direction also in words, for COLOR-2), a `description`, and one `action` control. With `href` it is a link and takes no `action`; pass `renderLink` to use the app router. While the value loads, pass `undefined` and a skeleton holds its place. Show only real values.
- `CopyButton`: copies a value to the clipboard, shows a check icon for a short time, and announces the copied label in a polite live region. A denied clipboard keeps the idle state.
- `CommandMenu`: a searchable command dialog (cmdk in a Radix dialog). It matches labels first, then keywords. It opens from the keyboard (Cmd+K on Apple platforms, Ctrl+K elsewhere) many times a day, so it has no open or close animation. Picking a command closes the menu and gives focus back to its opener before the command runs, so a command can open a dialog or move focus without a timer.

Primitive options that screens often need:

- `Button`: `appearance="outline"` is a surface fill with a bold border, and `appearance="raised"` a surface fill with a soft shadow and no border, for a white button on a tinted area. `spacing="icon"` is a square icon button; give it an `aria-label` (A11Y-3).
- `FilterMenu`: a compact button that shows the chosen option of a filter (a period, a scope) and opens a menu of choices. Its name is the filter's `label` and the visible value, so a screen reader says "Period Last 7 days". Use it instead of a full `Select` in a card or page header. `show="label"` keeps the filter's name on the button and the value only in its name; `chevron={false}` leaves out the chevron; `iconPlacement="end"` puts the `icon` after the text, such as a Filter button's funnel; `size` is `small`, `medium`, or `large`; `width="widest"` holds the width of the longest option (LAYOUT-5); `multiple` makes the menu checkboxes and `value` an array.
- `CardAction`: a control at the end of a `CardHeader`, such as a `FilterMenu` or a menu button. The header becomes two columns only when it holds one. Mark the card `@container/card` and the action moves under the title when the card is narrower than 24rem, so it never squeezes the title; `wrap={false}` keeps a short action, such as a period pill, on the title row. `CardIcon`, first in the header, is a decorative icon well before the title.
- `StatCard`: every part has a `data-slot` (`stat-card-label`, `stat-card-value`, …), so a screen restyles a part with `[&_[data-slot=stat-card-label]]:text-body`. `visual` puts a ring or a sparkline at the end of the value row. A `delta` takes `appearance="text"` for a plain change, `appearance="icon"` for a round tinted chip with only the icon (the change is read, not shown), and an `icon` (`null` for none); `deltaPlacement="below"` puts the change on the description's line, and `end` puts the description and then the change at the end of the value's line; `iconPlacement` is `start`, `end`, `top` (its own row above the label, with the `action` at its end), or `leading` (a large icon well beside the label and the value); `wrap={false}` keeps the value row on one line.
- `Badge`: `emphasis="outline"` is the role's text and border with no fill; `appearance="selected"` marks the chosen item of a set.
- `SearchTrigger`: a button that looks like a search field, with a `Kbd` shortcut hint, to open a `CommandMenu`. Its visible `label` is its name. `Kbd` takes `shortcut={{ apple: "⌘K", other: "Ctrl K" }}` and shows the Apple text only on Apple devices; the server renders `other`. `useApplePlatform()` picks `aria-keyshortcuts` the same way. `show="icon"` draws only the magnifier in a square button, with the label as its hidden name and no shortcut hint.
- `SegmentedControl`: one choice from a few options, as radios. `appearance="brand"` suits a bold brand surface: the track is the brand's hovered fill, the items are in the brand's inverse text, and the chosen item is a flat raised pill in ink.
- `NavUser`: `user.role` replaces the email line under the name; `avatarTone`, a `status` dot with a label, and `trailingIcon="chevrons"` change the look.
- `CardTitle`: `as="h2"` or `as="h4"` fits the title into the page outline; the default is `h3` (TYPE-2).
- `Banner`: `emphasis="subtle"` uses the tinted fill. It is a polite `status`; `urgent` makes it an `alert` for a problem that needs attention now.
- `Checkbox`: `checked="indeterminate"` draws a minus, for a select-all box with some rows selected. The box is 16px with a 24px hit area.
- `RadioGroupItem`: the ring of an unselected radio uses the field border (FORM-3), so it reaches 3:1 on every surface (SC 1.4.11).
- `Table`: a wide table scrolls inside itself; the scroller becomes a tab stop only while it overflows. `scrollLabel` names it as a group, not a landmark, so it can share its card's name. A `TableHead` with `onSort` holds a sort button, and `sort` sets its `aria-sort`; the caller sorts the rows.
- `AppSidebar`: `label` names its navigation landmark, which holds the header, the links, and the footer. `headerClassName` and `footerClassName` add classes after their own padding, such as measured insets. A `SidebarGroup` with a `SidebarGroupLabel` is a named group, and a `SidebarMenuBadge` count describes its link. The badge and a `SidebarMenuAction` center on their row at the end and have no state variants of the link, so a screen's `end-*`, `top-*`, and text color hold on hover and on the current link; in an item that holds a submenu, they center on a default-size link. `SidebarTrigger` takes children in place of its panel icon, such as chevrons that turn with the state.
- `Sidebar`: `label` gives a sidebar built from the primitives the same named landmark. `surface` sets its fill: `sunken` (the default), `default`, or `raised`. `SidebarMenuButton variant="neutral"` marks the current item with the neutral fill and no indicator, and `variant="brand"` with brand text and icon on the neutral fill. `SidebarMenuSub tree` draws tree lines: the rail ends at the last sub-item, and a branch reaches each one.
- `TopNav`: a horizontal primary navigation for apps without a sidebar. The current link has `aria-current="page"` and the selected pill; the row scrolls inside itself on a narrow screen. `renderLink` uses the app router. `appearance="filled"` draws the current page in the bold selected fill, `itemWidth="equal"` gives every link the same width, and `size` is `medium`, `large`, or `xlarge`.
- `PageHeader`: `size="display"` sets the title in `text-display`, for a page whose title is its hero. `descriptionSize` is `small`, `default`, or `large`. The actions shrink to the header's width on their own line, so a wide bar wraps or scrolls inside it.
- `AvatarFallback`: `tone` sets initials on a role tint (`brand`, `success`, `information`, …), or on a chart tint (`chart-1` to `chart-6`), each a pair the theme check measures. `Avatar` sizes add 28, 36, and 44px between the named steps. `AvatarGroup` takes `overlap="sm"` and an `overflowTone` for the "+N" chip.
- `CopyButton`: `labelSuffix` adds hidden words after the visible label, so several copy buttons on one page get distinct names ("Copy link, Q3 report").
- Charts: `LineChart` takes `dots`, a pinned `annotation`, and `area="gradient"`. `BarChart` takes `track`, `orientation="horizontal"`, and `highlightColor`. Both take `indexLabels="all"` to keep every category label. `RadialProgress` takes a `color` and `size="xs"`. `Gauge` is a semicircle, segmented or solid, for one value or for colored parts.
- `RadialProgress`: plain SVG, so it draws without the chart library and sweeps to a new value on the motion tokens. A number `size`, such as 28, sets a ring that fills a box of that many pixels; `valuePosition="end"` puts the value after the ring, for a row; `fill` adds a pale disc of a color inside, a chart color's tint for a chart slot; `innerRatio` sets the band's thickness. `interaction` makes it answer the pointer and the keyboard as the charts do; without it the ring is still, since its value is in sight.
- `Gauge`: `center` puts your own content in the middle, such as the label above the value or a figure in two colors, while `centerValue` and `centerLabel` still fill the table and the slider text. `legend={false}` hides the parts' legend, `innerRatio` sets the ring's thickness, and `segmentCaps="butt"` cuts the segments square. Each part has a `data-slot` (`gauge-center`, `gauge-value`, `gauge-legend-value`, …).
- `ProportionBar`: a slider over its parts, as a plot is (DATA-5): hover, focus, or a tap rings a part and shows its name and value above the bar, the arrow keys walk the parts, a click or Enter pins one, and Escape lets it go. A part grows to a new value on the motion tokens. `interaction={false}` keeps a still picture, `tooltip={false}` leaves the words to your labels, and `onActiveChange` reports the active part. A segment's `fill="hatch"` draws it as lines of its color, its legend swatch too. `height` sets any thickness in pixels.
- `ProgressBar`: `height` sets any thickness in pixels. `track` is `neutral` (the default), `sunken`, `hatch`, or `none`; a chart fill keeps 3:1 against each one. `parts` lays several fills end to end, and `gap` sets the fills apart from the rest with round ends.
- `bg-hatch` draws lines 6px apart in the text color on no fill, for a hatched part in HTML: `bg-hatch text-ds-chart-3`.

### 11.2 Plot primitives and 3D

When a chart design needs a mark that the chart components have no option for, build it from the plot primitives in `@repo/ui`. `Plot` measures its width, holds explicit margins, provides d3 scales through `usePlot()`, and renders a titled figure with a hidden data table (A11Y-7). A plot whose table has one row per point is interactive by default (DATA-5): hover, focus, or tap marks the active point, rings or grows its mark, and shows its row in a tooltip that glides and fades; a click, Enter, or Space pins it, Escape unpins it, and the arrow keys walk the points. Hit testing finds the nearest point, the band under the pointer, or a ring's slice by angle. Every mark tweens to new data on the motion tokens and snaps under reduced motion. `interaction` sets the stops, the description, and a controlled selection (`selectedIndex`, `onSelectedChange`); `interaction={false}`, `tooltip={false}`, `animate={false}`, and a mark's `highlight={false}` opt out. `interaction.spans` gives each point its extent, so parts of unequal size (a stacked or share bar) pick by the part under the pointer. `interaction.rest` sets what the pinned point shows at rest: `"all"` (the default), `"highlight"` (its tooltip waits until people use this plot, for plots that share one selection), or `"none"` (for a pinned mark with its own look). `usePlot()` gives custom marks `activeIndex`, `selectedIndex`, and `highlight`; `usePlotTween` moves a custom mark on the motion tokens as the plot's marks move (its `keys` name each number, so marks that change order slide to their new places), and `PLOT_RING` paints the plot's active ring. `scrub` is the older form where the selection follows the pointer and the caller draws it. Its children are SVG marks, painted back to front: `PlotGrid`, `PlotFrame` (hairlines along the `sides` of the drawing area you name), `PlotStems` (`highlight` draws the active stem in the text color), `PlotArea`, `PlotBand`, `PlotBars` (grouped with `group`, rounded with `round`, rows with `orientation="horizontal"`, stacked with a `y0` or `x0` per bar, which rings the column as one; bars that change order, such as sorted ones, slide to their new places; `trackPad` grows the `track` around the bar into a row; `gap` starts each bar a few pixels from its baseline, so stacked segments and the rises and falls of a diverging chart sit apart), `PlotHighlight`, `PlotLine` (`extend` runs it to the edges of the drawing area), `PlotDots`, `PlotArcs` (equal segments, or value-sized slices with `values`; `radii` for slices that each reach their own distance, a polar area chart; `stroke` for an edge or an even gap, `offset` to move a slice out, `label` for text on each slice; `usePlotRing` gives a custom mark the same ring's center, radii, `angleAt`, and `pointAt`, such as a knob where a gauge's value ends), `PlotCrosshair`, and `PlotAxis` (`align="start"` for y labels that line up at the left edge, `\n` in a label for a second line, `highlight` for the active label in the text color, `side="top"` for x labels above the drawing area, `align="end"` to end a label at its value, `ticks` for short tick marks in the bold border color, and `shortFormat` for short x labels, such as three-letter names, that every label takes when one full label does not fit its room). `paintFill` and `plotColor` paint a custom mark with the same token rules. A `PlotFill` is solid, a gradient (one color that fades, or `stops` through several colors), a hatch (with a `base` fill under its lines, such as a tint), or a chart color's `tint` (`{ type: "tint", color: "chart-2" }`, for a bar that carries ink text; `opacity` fades it, such as a band under lines), and every color is a token; `"sunken"` paints the well, such as a track. HTML goes in `overlay`: `PlotTooltip`, `PlotAnchor`, and `PlotLegend` (a swatch takes a chart color, or `"ink"` for a series drawn in the text color). A `PlotAnchor` whose `x` or `y` is a category sits on that band, so one anchor per row labels every bar of a row chart. `side="above"` or `"below"` centers a tooltip on its point, keeps it inside the plot sideways, and flips it when only the other side fits; `side="beside"` centers it on a row. `maxWidth` wraps long content. A legend item's `fill` paints its swatch as a tint or a hatch, with an edge in its color. The UI lab's `#/charts` page shows each primitive.

3D views live in `@repo/ui-3d`, never in the `@repo/ui` barrel, so three.js loads only on screens that use it. `docs/ui/3d.md` and the `kaine-build-3d` skill cover when 3D is worth it and how `Viewport3D` keeps it accessible (A11Y-8).

A focus ring appears at once: every element holds the focus color before it takes focus, so `transition-colors` never fades the default ring in.

Settings pages with tabs (Organization, Account) use link navigation, not Radix `Tabs`. Each tab is a route (`/organization/members`), so refresh, back, and deep links keep the open tab. Render the links inside a labeled `nav` with `tabsListClassName` and `tabsTriggerClassName`; the active link has `aria-current="page"` and shows the same selected state as an active tab. On a narrow screen the tab row scrolls inside itself.

Selected navigation uses the selected tokens, not the hover token. The active sidebar item uses `--ds-background-selected`, also on hover, with `--ds-text-selected` and an inset start indicator of `--ds-border-width-selected` in `--ds-border-selected`. The indicator is an inset shadow, so it does not shift the layout. A sidebar whose brand color does not mark selection uses `variant="neutral"`: the current item takes `--ds-background-neutral` with `--ds-text` and no indicator, and its medium weight still marks it. An active tab or tab link uses a `--ds-border-width-thick` bottom border in `--ds-border-selected`.

## 12. Accessibility

Baseline:

- WCAG 2.2 AA. Contrast: 4.5:1 for text (SC 1.4.3), 3:1 for UI graphics such as field borders, focus rings, icons, and chart series (SC 1.4.11). The theme check enforces the token pairs.
- Pointer targets are at least 24x24px (SC 2.5.8); the theme check enforces control heights.
- Focus is never hidden behind sticky headers or overlays (SC 2.4.11).
- Focus indicators use `--ds-border-focused` and are visible on every surface.
- Keyboard order follows DOM order.
- Composite widgets support arrow keys where expected.
- Escape closes the nearest overlay.
- Dynamic status changes use live regions where needed.
- Icons are either decorative with `aria-hidden` or have accessible names.
- Forms pair labels and controls with `htmlFor`/`id` or native equivalents.
- Touch targets are at least 44x44px for mobile primary interactions.
- `docs/ui/guidelines.md` lists the full rules; the A11Y, COLOR, and FORM rules marked MUST always hold.

## 13. Asset and Visual Rules

- Do not use decorative gradient orbs, bokeh blobs, or one-note palettes.
- Without a brand or a reference to follow, avoid dominant purple/purple-blue gradients, beige/cream/sand/tan, dark blue/slate, and brown/orange/espresso palettes. A brand, a theme, or a requested look overrides this taste rule (precedence in `docs/ui/guidelines.md`); the brand color then marks actions and selection, not whole surfaces.
- Use real images only when the experience calls for them; do not add marketing imagery to app/tool screens by default.
- Avoid generic AI-generated frontend defaults: vague glassmorphism, context-free gradients, dramatic blur, fake stock atmosphere, and ornamental effects that do not explain the product.
- Visual detail should come from the product domain, data, workflow, or brand direction rather than decoration.
- Games and simulations need actual visual assets or code-native visuals, but this template is not a game scaffold.

## 14. Implementation Checklist

Before shipping UI work, go through `docs/ui/quality-checklist.md` and run `pnpm ui:check`.
