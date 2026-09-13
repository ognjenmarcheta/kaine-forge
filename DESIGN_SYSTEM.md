# Design System

This document is the visual authority for Kaine Forge. It defines the token model, theme rules, component styling expectations, accessibility baseline, and the split between web/desktop UI and mobile UI. For architecture, package boundaries, data flow, and engineering conventions, use `MONOREPO_GUIDE.md`.

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

| Surface         | Package           | Runtime      | Styling pipeline                                       |
| --------------- | ----------------- | ------------ | ------------------------------------------------------ |
| Web and desktop | `@repo/ui`        | React DOM    | Tailwind CSS v4, shadcn/Radix, CSS custom properties   |
| Mobile          | `@repo/mobile-ui` | React Native | NativeWind, Tailwind CSS v3-compatible mobile pipeline |

Rules:

- Use `@repo/ui` only in web/desktop React DOM code.
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

| Tier              | Purpose                                  | Example                                    |
| ----------------- | ---------------------------------------- | ------------------------------------------ |
| Base tokens       | raw palette/scale values, reference only | `--ds-base-light-surface-default`          |
| Functional tokens | semantic UI values, primary consumer API | `--ds-text`, `--ds-background-danger-bold` |
| Component tokens  | component or pattern-specific values     | `--ds-button-brand-bg-hovered`             |

Base tokens should not be used directly in component classes or CSS. Functional tokens are the default choice.

### 3.2 Token Foundations

| Foundation | Prefix examples                                               |
| ---------- | ------------------------------------------------------------- |
| Text       | `--ds-text`, `--ds-text-subtle`, `--ds-text-danger`           |
| Icon       | `--ds-icon`, `--ds-icon-subtle`, `--ds-icon-success`          |
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

| Level                | Use                                           |
| -------------------- | --------------------------------------------- |
| `subtlest`           | quiet background tint                         |
| `subtle`             | stronger tint or subdued foreground           |
| default              | normal foreground/background role             |
| `bold`               | strong fill, usually paired with inverse text |
| `bolder` / `boldest` | maximum emphasis                              |

Text on bold backgrounds must use inverse tokens when contrast requires it.

## 4. Color Rules

Semantic roles:

| Role        | Meaning                               |
| ----------- | ------------------------------------- |
| Neutral     | default chrome, text, dividers        |
| Brand       | primary actions and product identity  |
| Information | help, guidance, neutral notices       |
| Success     | positive outcome or completion        |
| Warning     | caution or pending risk               |
| Danger      | errors or destructive actions         |
| Attention   | non-critical notice                   |
| Severe      | high urgency warning                  |
| Discovery   | onboarding, new features, exploration |

Workflow states:

| State  | Meaning               |
| ------ | --------------------- |
| Open   | active or in progress |
| Closed | rejected or closed    |
| Done   | completed             |

Rules:

- Never use color as the only communicator. Pair it with text, iconography, shape, or state labels.
- Do not use accent colors for semantic states. Use `success`, `warning`, `danger`, and related semantic roles.
- Use tokenized interaction states such as `hovered`, `pressed`, `focused`, and `disabled`.
- Do not use opacity hacks, `filter`, or custom hover colors for interaction states in components.
- Do not hardcode hex, rgb, hsl, or named colors in component code.

## 5. Typography

Typography tokens define hierarchy and rhythm.

| Token                       | Use                                       |
| --------------------------- | ----------------------------------------- |
| `--ds-font-heading-display` | largest marketing/product display heading |
| `--ds-font-heading-xxlarge` | major page heading                        |
| `--ds-font-heading-xlarge`  | page heading                              |
| `--ds-font-heading-large`   | section heading                           |
| `--ds-font-heading-medium`  | card/panel heading                        |
| `--ds-font-heading-small`   | compact heading                           |
| `--ds-font-body-large`      | prominent body text                       |
| `--ds-font-body`            | default body text                         |
| `--ds-font-body-small`      | supporting text                           |
| `--ds-font-body-xsmall`     | metadata                                  |
| `--ds-font-code`            | code and monospaced labels                |

Rules:

- Do not scale font size with viewport width.
- Letter spacing should be `0` unless a component has a documented tokenized exception.
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
| `--ds-control-medium` | 32px   | default web controls  |
| `--ds-control-large`  | 40px   | prominent controls    |
| `--ds-control-xlarge` | 48px   | mobile/touch controls |

Shape:

| Token              | Value  | Use                       |
| ------------------ | ------ | ------------------------- |
| `--ds-radius-050`  | 3px    | tiny controls             |
| `--ds-radius-100`  | 4px    | default                   |
| `--ds-radius-200`  | 8px    | larger surfaces and cards |
| `--ds-radius-300`  | 12px   | large panels              |
| `--ds-radius-pill` | 9999px | pills                     |

Rules:

- Keep cards and buttons at `8px` radius or less unless the design system explicitly defines a larger pattern.
- Use stable dimensions for grids, boards, toolbars, counters, icon buttons, and fixed-format UI.
- Avoid layout shift when labels, loading states, badges, or hover states change.

## 7. Elevation

Surface and shadow levels must match.

| Level    | Surface token          | Shadow token           | Use                         |
| -------- | ---------------------- | ---------------------- | --------------------------- |
| default  | `--ds-surface`         | none                   | normal page/card surface    |
| raised   | `--ds-surface-raised`  | `--ds-shadow-raised`   | cards and raised containers |
| overlay  | `--ds-surface-overlay` | `--ds-shadow-overlay`  | dropdowns/popovers          |
| floating | `--ds-surface-overlay` | `--ds-shadow-floating` | dialogs/modals              |
| sunken   | `--ds-surface-sunken`  | none                   | recessed wells              |

Do not pair `surface-raised` with `shadow-overlay` or default surface with raised shadow unless a documented component token says so.

### Motion contract

Use CSS on web/desktop and Reanimated on native. Do not add an animation framework. Canonical duration tokens are `--ds-motion-control` (120ms), `--ds-motion-overlay` (180ms), and `--ds-motion-drawer` (220ms). Use small opacity/transform transitions, respect reduced motion, and never delay navigation. Theme changes are immediate and preserve drafts, focus, and scroll.

- Use `--ds-motion-easing` for calm transitions without bounce. Sidebar rail and spacer resize together while labels fade; interrupted width transitions reverse from the current geometry. Footer preferences stay in fixed vertical slots above a stable-height profile row.
- Sheets enter and exit fully from their declared edge. Backdrops fade. Dialogs combine opacity with `--ds-motion-distance-dialog` (8px); anchored menus/tooltips use `--ds-motion-distance-menu` (4px). Preserve positioning transforms. Radix owns exit presence and focus restoration.
- Attachment disclosures interpolate intrinsic content height with CSS grid. Keep their upload controls mounted; closed content is inert and becomes hidden after collapse. Do not animate message streams, list staggering, or route entry.
- Enabled buttons use `--ds-motion-distance-press` (2px) for press feedback. Native buttons move their content inside a stable touch target and preserve caller styles and refs. Focus indicators remain immediate.
- Native dialogs use Reanimated timing with generated durations/easing/distances. Keep content mounted through exit, cancel interrupted animations, and ignore stale exit completions after reopening. Existing explicit `animationType="none"` disables motion; `slide` retains a full-height slide.
- Follow device reduced motion, including runtime changes. Remove motion immediately rather than adding an app override. The native drawer keeps its clamped gesture animation, with a pnpm patch replacing its explicit reduced-motion opt-out in both source and compiled module. Remove that patch when the upstream package honors the system preference itself.
- Test intermediate browser geometry and entry/exit lifetimes, not only final screenshots. Keep short motion recordings for review. Bundle exports cannot verify physical-device motion or accessibility.

### Workflow visual direction

Use neutral white and charcoal surfaces with restrained blue primary actions. Keep the system font stack and 4–8px control radii. Use aligned rows and dividers for work lists. The dashboard links to existing workflows; it does not show invented analytics. Web/desktop use a full-height sidebar; mobile retains a drawer with explicit preferences. All existing platform capabilities stay available.

Web/desktop sidebar preferences use two neutral, labeled footer rows: Language, then Theme, with muted current values. Collapsing keeps both controls mounted in the same vertical positions and shows icon tooltips with their current values. Expanded menus open upward; collapsed menus open to the right, with viewport collision handling. Use native language names and radio selection semantics. The responsive web drawer keeps full labels and 48px control heights. `ShellSelectControl` supports an optional `compact` display and `NavPreferences` supports a `footer` layout; existing defaults remain available.

The web/desktop AI Assistant uses a viewport-height split workspace. A 256px conversation rail appears from 1024px; narrower screens use a history Sheet. History and transcript scroll independently, with the conversation header and composer kept visible. User messages use the selected surface; assistant replies use the neutral surface, with a maximum 768px reading column. The labeled composer grows from two to six lines, with a two-line ceiling on short viewports. Starter prompts fill the composer without sending. Status text announces thinking and responding without announcing every streamed token. Reading older messages suspends scroll following until the user selects “Jump to latest.” Confirmed Todo and Note results link to the existing workflows; a collapsed Activity disclosure contains the returned action list. Failures retain the prompt and distinguish unavailable configuration from uncertain actions. Theme and language changes preserve drafts and scroll; Active Organization changes reset route-local state.

The web/desktop Notes workspace shows a 288px searchable note rail from 1024px. Narrower screens show the list or editor according to the URL, with Back to Notes restoring list focus. The rail and document scroll independently; the workspace header and Save action remain visible. The plain-text writing column has a maximum width of 768px. New note opens a local draft; its first successful Save creates a saved URL. Title/body edits require Save (Ctrl/Cmd+S), while linked Todo checklist changes save immediately. Unsaved drafts remain reachable above search results and survive note, theme, and language changes within the workspace. Leaving with drafts requires an explicit discard decision; Organization changes wait for pending mutations. External changes never replace a dirty draft, and deleted notes retain recoverable draft text. Search covers saved titles and bodies across the Active Organization, with 50-note pages and Load more. Search does not include unsaved text. Drafts are in memory only and clear when the workspace or Active Organization changes.

The web/desktop Todos workspace uses a single list with a maximum width of 1024px. Quick creation shares its title and optional description with the Add details dialog. A labeled search and All/Open/Completed controls filter saved titles and descriptions across the Active Organization, with 50-item pages and Load more. Search and status live in the URL; All is the default. The toolbar remains visible above an independently scrolling list from 768px on viewports at least 640px tall. Smaller or shorter screens use normal document scrolling. Rows separate completion checkboxes from title buttons, show a description preview and localized update date, and disclose attachments on demand. Menus contain deletion, AI generation, and form examples. Completion changes wait for confirmation; title/description saves never resend completion. Drafts survive filtering, theme, and language changes; leaving warns about unsaved text and waits for pending operations. Attachment uploads remain attached to their originating Todo even when filtered out. Errors stay beside the affected action, and uncertain creation is never retried automatically. Counts describe loaded results, not Organization-wide totals. The shared shell navigation guard preserves the same protection for Notes.

## 8. Theming

The current template supports light, dark, and system preference behavior. Theme switching is done by setting `data-theme` at the app root and resolving tokens through CSS custom properties.

Rules:

- Do not branch component code on theme when a token can express the difference.
- New theme values should redefine tokens, not component internals.
- No secrets or runtime environment values belong in theme files.
- Use `prefers-reduced-motion` protections for motion-heavy patterns.
- Use motion to clarify orientation, feedback, or state transitions. Prefer a few deliberate transitions over scattered effects.

## 9. Web/Desktop Styling

`@repo/ui` owns React DOM primitives and composed components.

Token definitions and Tailwind mappings live primarily in:

- `packages/ui/src/styles/globals.css`
- `packages/config/tailwind/preset.js`

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

Canonical functional and structural tokens live in `packages/ui/src/styles/globals.css` (with web contract tests). Mobile does **not** hand-maintain a second hex palette. The same generator emits `packages/mobile-ui/src/lib/design-tokens.ts` for native navigation colors and motion durations; consume its public `@repo/mobile-ui` exports for APIs that require concrete runtime values.

Pipeline:

1. Edit tokens only in `packages/ui/src/styles/globals.css`.
2. Run `pnpm tokens:mobile` (or `node scripts/sync-mobile-design-tokens.mjs`) to regenerate the marked region in `apps/mobile/src/styles/global.css`.
3. `pnpm tokens:mobile:check` (and the `@repo/ui` contract test) fail if mobile CSS drifts from the web source.

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
- After changing web tokens, re-run `pnpm tokens:mobile` before committing.

## 11. Layout Patterns

Use full-width sections or app-shell regions for page structure. Cards are for individual repeated items, dialogs, or clearly framed controls. Do not put cards inside cards.

Composition rules:

- Start with the workflow shape: navigation, primary task, supporting context, and secondary actions.
- Avoid generic stacks of floating cards when a tighter app shell, table, split view, toolbar, or full-width section communicates the task better.
- Use asymmetry, contrast, or distinctive structure only when it improves hierarchy, scanning, or product character.
- Keep app and tool screens usable first. Landing-page treatment, oversized hero typography, and decorative storytelling do not belong in routine workflow surfaces.

Common patterns:

- App shell: header, sidebar/drawer, main content.
- Dialog/modal: focus-trapped, escape-close, focus returns to trigger.
- Popover/menu: keyboard navigable, touch-friendly spacing.
- Banner/flag: semantic role color plus text/icon.
- Data table: semantic headers, loading skeletons, empty state, responsive fallback.
- Form: visible labels, helper/error text, disabled pending state, translated strings.

## 12. Accessibility

Baseline:

- WCAG 2.1 AA contrast: 4.5:1 for normal text, 3:1 for large text and UI graphics.
- Focus indicators use `--ds-border-focused` and are visible on every surface.
- Keyboard order follows DOM order.
- Composite widgets support arrow keys where expected.
- Escape closes the nearest overlay.
- Dynamic status changes use live regions where needed.
- Icons are either decorative with `aria-hidden` or have accessible names.
- Forms pair labels and controls with `htmlFor`/`id` or native equivalents.
- Touch targets should be at least 44x44px for mobile primary interactions.

## 13. Asset and Visual Rules

- Do not use decorative gradient orbs, bokeh blobs, or one-note palettes.
- Avoid dominant purple/purple-blue gradients, beige/cream/sand/tan, dark blue/slate, and brown/orange/espresso themes unless a product-specific design decision overrides the template.
- Use real images only when the experience calls for them; do not add marketing imagery to app/tool screens by default.
- Avoid generic AI-generated frontend defaults: vague glassmorphism, context-free gradients, dramatic blur, fake stock atmosphere, and ornamental effects that do not explain the product.
- Visual detail should come from the product domain, data, workflow, or brand direction rather than decoration.
- Games and simulations need actual visual assets or code-native visuals, but this template is not a game scaffold.

## 14. Implementation Checklist

Before shipping UI work:

- All visible strings are translated.
- Components use `@repo/ui` or `@repo/mobile-ui` as appropriate.
- Visual values use `--ds-*` tokens or mapped Tailwind utilities.
- Focus, keyboard, touch, loading, empty, disabled, error, and success states are covered.
- Layout remains stable as content and state change.
- UI composition has a clear audience, task, tone, and product-specific design choice.
- Motion, imagery, and visual effects have a functional or domain-specific purpose.
- Tests cover behavior that can regress.
- `pnpm format:check`, `pnpm lint`, and relevant type/tests pass.
