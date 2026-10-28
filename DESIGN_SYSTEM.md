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

| Surface               | Package           | Runtime      | Styling pipeline                                       |
| --------------------- | ----------------- | ------------ | ------------------------------------------------------ |
| Web, desktop, desk UI | `@repo/ui`        | React DOM    | Tailwind CSS v4, shadcn/Radix, CSS custom properties   |
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

| Tier              | Purpose                                  | Example                                                         |
| ----------------- | ---------------------------------------- | --------------------------------------------------------------- |
| Base tokens       | raw palette/scale values, reference only | `--ds-base-light-surface-default`                               |
| Functional tokens | semantic UI values, primary consumer API | `--ds-text`, `--ds-background-danger-bold`                      |
| Component tokens  | component or pattern-specific values     | `--ds-button-brand-bg-hovered` (illustrative; none defined yet) |

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

Text on bold backgrounds must use inverse tokens when contrast requires it. Brand and selected bold fills are a deep red-orange in both themes, so text and icons on them use `--ds-text-brand-inverse` (white in both themes), not `--ds-text-inverse`, which turns dark in the dark theme. Hovered and pressed brand fills get darker, not lighter, so white text keeps AA contrast.

## 4. Color Rules

The default palette is the Byteforge brand: one red-orange for actions, selection, links, and focus (`#d4421a` fills in both themes, with `#b3360f` light and `#ff7a50` dark for text and links), on cool white and ink-black neutrals. Light and dark values come from the Byteforge website tokens. The `pnpm --filter @repo/ui test` contrast contract checks the key text and control pairs in both themes against the WCAG AA baseline in §12.

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

Reading-first workspaces, such as the agent desk, use a larger, airier scale: `--ds-font-body-comfortable` (15px/1.55) for body text, `--ds-font-body-snug` (13.5px) for secondary text such as tables and status bars, `--ds-font-body-compact` (13px) for metadata, `--ds-font-code-small` (12.5px) for code, `--ds-font-heading-row` (15.5px) for list row titles, `--ds-font-heading-card` (19px) for card headings and key figures, and `--ds-font-heading-page` (26px) for the page title. Their headings use `--ds-letter-spacing-heading` (-0.015em), the one tokenized letter-spacing exception.

The typefaces are Geist and Geist Mono, self-hosted with the app so desktop works offline. Web and desktop load the variable fonts from `@repo/ui`; mobile loads the static weights with `expo-font`. Headings use weight 500, except the small heading sizes, which keep 600.

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

| Token              | Value  | Use                                               |
| ------------------ | ------ | ------------------------------------------------- |
| `--ds-radius-050`  | 4px    | badges, tags, checkboxes                          |
| `--ds-radius-100`  | 8px    | inputs, selects, menu items, list rows            |
| `--ds-radius-200`  | 12px   | menus, popovers, panels                           |
| `--ds-radius-250`  | 16px   | agent desk cards and panels                       |
| `--ds-radius-300`  | 20px   | cards, dialogs, sheets                            |
| `--ds-radius-400`  | 28px   | large feature surfaces                            |
| `--ds-radius-pill` | 9999px | buttons, icon buttons, toggles, pagination, pills |

Rules:

- Buttons are pills. Cards and dialogs use `--ds-radius-300`; agent desk cards use `--ds-radius-250`. Inputs and selects use `--ds-radius-100`. Do not invent radii between the steps.
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

- Use `--ds-motion-easing` (a quick ease-out, `cubic-bezier(0.23, 1, 0.32, 1)`) for calm transitions without bounce. Sidebar rail and spacer resize together while labels fade; interrupted width transitions reverse from the current geometry. Footer preferences stay in fixed vertical slots above a stable-height profile row.
- Sheets enter and exit fully from their declared edge. Backdrops fade. Dialogs combine opacity with `--ds-motion-distance-dialog` (8px); anchored menus/tooltips use `--ds-motion-distance-menu` (4px). Preserve positioning transforms. Radix owns exit presence and focus restoration.
- Attachment disclosures interpolate intrinsic content height with CSS grid. Keep their upload controls mounted; closed content is inert and becomes hidden after collapse. Do not animate message streams, list staggering, or route entry.
- Enabled buttons scale to `--ds-motion-press-scale` (0.97) for press feedback. Native buttons scale their visible surface inside a stable touch target and preserve caller styles and refs. Focus indicators remain immediate.
- Native dialogs use Reanimated timing with generated durations/easing/distances. Keep content mounted through exit, cancel interrupted animations, and ignore stale exit completions after reopening. Existing explicit `animationType="none"` disables motion; `slide` retains a full-height slide.
- Follow device reduced motion, including runtime changes. Remove motion immediately rather than adding an app override. The native drawer keeps its clamped gesture animation, with a pnpm patch replacing its explicit reduced-motion opt-out in both source and compiled module. Remove that patch when the upstream package honors the system preference itself.
- Test intermediate browser geometry and entry/exit lifetimes, not only final screenshots. Keep short motion recordings for review. Bundle exports cannot verify physical-device motion or accessibility.

### Workflow visual direction

Use cool white and ink-black surfaces with one Byteforge orange for primary actions, selection, and links. Use Geist and the §6 shape scale: pill buttons, 8px inputs, 20px cards and dialogs. Use aligned rows and dividers for work lists. The dashboard shows real Active Organization counts (open Todos, Notes, unread notifications) and recent items that link to the existing workflows; it does not show invented analytics. Web/desktop use a full-height sidebar; mobile retains a drawer with explicit preferences. All existing platform capabilities stay available.

Web/desktop sidebar preferences use two neutral, labeled footer rows: Language, then Theme, with muted current values. Collapsing keeps both controls mounted in the same vertical positions and shows icon tooltips with their current values. Expanded menus open upward; collapsed menus open to the right, with viewport collision handling. Use native language names and radio selection semantics. The responsive web drawer keeps full labels and 48px control heights. `ShellSelectControl` supports an optional `compact` display and `NavPreferences` supports a `footer` layout; existing defaults remain available.

The web/desktop AI Assistant uses a viewport-height split workspace. A 256px conversation rail appears from 1024px; narrower screens use a history Sheet. History and transcript scroll independently, with the conversation header and composer kept visible. User messages use the selected surface; assistant replies use the neutral surface, with a maximum 768px reading column. The labeled composer grows from two to six lines, with a two-line ceiling on short viewports. Starter prompts fill the composer without sending. Status text announces thinking and responding without announcing every streamed token. Reading older messages suspends scroll following until the user selects “Jump to latest.” Confirmed Todo and Note results link to the existing workflows; a collapsed Activity disclosure contains the returned action list. Failures retain the prompt and distinguish unavailable configuration from uncertain actions. Theme and language changes preserve drafts and scroll; Active Organization changes reset route-local state.

The web/desktop Notes workspace shows a 288px searchable note rail from 1024px. Narrower screens show the list or editor according to the URL, with Back to Notes restoring list focus. The rail and document scroll independently; the workspace header and Save action remain visible. The plain-text writing column has a maximum width of 768px. New note opens a local draft; its first successful Save creates a saved URL. Title/body edits require Save (Ctrl/Cmd+S), while linked Todo checklist changes save immediately. Unsaved drafts remain reachable above search results and survive note, theme, and language changes within the workspace. Leaving with drafts requires an explicit discard decision; Organization changes wait for pending mutations. External changes never replace a dirty draft, and deleted notes retain recoverable draft text. Search covers saved titles and bodies across the Active Organization, with 50-note pages and Load more. Search does not include unsaved text. Drafts are in memory only and clear when the workspace or Active Organization changes.

The web/desktop Todos workspace uses a single list with a maximum width of 1024px. Quick creation shares its title and optional description with the Add details dialog. A labeled search and All/Open/Completed controls filter saved titles and descriptions across the Active Organization, with 50-item pages and Load more. Search and status live in the URL; All is the default. The toolbar remains visible above an independently scrolling list from 768px on viewports at least 640px tall. Smaller or shorter screens use normal document scrolling. Rows separate completion checkboxes from title buttons, show a description preview and localized update date, and disclose attachments on demand. Menus contain deletion, AI generation, and form examples. Completion changes wait for confirmation; title/description saves never resend completion. Drafts survive filtering, theme, and language changes; leaving warns about unsaved text and waits for pending operations. Attachment uploads remain attached to their originating Todo even when filtered out. Errors stay beside the affected action, and uncertain creation is never retried automatically. Counts describe loaded results, not Organization-wide totals. The shared shell navigation guard preserves the same protection for Notes.

### Agent desk calm accent

The agent desk (`tooling/desk-ui`) uses orange only where the person acts. The rule keeps the eye on the next decision.

- Use orange for the logo mark, primary action buttons, links, and a count of items that need the person. Make a count quiet (`.desk-count--quiet`, or `data-empty` for zero) when it asks for nothing.
- Show selection in ink, not orange: the active page is a raised neutral pill (`--ds-surface-raised`, `--ds-border-strong`), and the active tab and the selected stage use `--ds-text`.
- Frame cards with a `--ds-border` hairline, `--ds-radius-250`, and 20px padding. Do not add a shadow. Use `--ds-surface-sunken-bold` for quiet fills such as tags and neutral counts, and `--ds-surface-inverse` with `--ds-text-surface-inverse` for terminal output and toasts.
- Give each status chip a glyph as well as its words (`.desk-chip__glyph`), so a status reads without color.
- Remove animation and transitions when the person asks for reduced motion.

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

Token definitions and the Tailwind v4 mapping (`@theme inline`) live in `packages/ui/src/styles/globals.css`. `packages/config/tailwind/preset.js` is the Tailwind v3 mapping for mobile (NativeWind) only.

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

### 11.1 Composed page parts

`@repo/ui` ships these composed parts. They take translated text from the caller and import no translations.

- `PageHeader`: the page's only `h1`, with an optional eyebrow, description, and right-aligned `actions`. Every shell page starts with it.
- `EmptyState`: a quiet panel for a list with no items. Give it a title, an optional description and icon, and one `action` that starts the first item.
- `QueryError`: a `role="alert"` message with a retry button. Use it for every failed read, beside the data that failed. Do not use it for a failed write; keep that error beside its action.
- `SettingsSection`: a flat, full-width block with a title, an optional description, and `actions`. A divider separates consecutive sections. Do not wrap a section in a Card.
- `StatCard`: a label and a count. With `href` it is a link; pass `renderLink` to use the app router. While the count loads, pass `undefined` and a skeleton holds its place. Show only real counts.
- `CopyButton`: copies a value to the clipboard, shows a check icon for a short time, and announces the copied label in a polite live region. A denied clipboard keeps the idle state.
- `CommandMenu`: a searchable command dialog (cmdk in a Radix dialog). It matches labels first, then keywords. It opens from the keyboard (Cmd+K on Apple platforms, Ctrl+K elsewhere) many times a day, so it has no open or close animation.

Settings pages with tabs (Organization, Account) use link navigation, not Radix `Tabs`. Each tab is a route (`/organization/members`), so refresh, back, and deep links keep the open tab. Render the links inside a labeled `nav` with `tabsListClassName` and `tabsTriggerClassName`; the active link has `aria-current="page"` and shows the same selected state as an active tab. On a narrow screen the tab row scrolls inside itself.

Selected navigation uses the selected tokens, not the hover token. The active sidebar item uses `--ds-background-selected`, also on hover, with `--ds-text-selected` and an inset start indicator of `--ds-border-width-selected` in `--ds-border-selected`. The indicator is an inset shadow, so it does not shift the layout. Do not put `--ds-text-selected` on `--ds-background-selected-hovered`: in light theme the pair is below 4.5:1. An active tab or tab link uses a `--ds-border-width-thick` bottom border in `--ds-border-selected`.

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
- Avoid dominant purple/purple-blue gradients, beige/cream/sand/tan, dark blue/slate, and brown/orange/espresso themes unless a product-specific design decision overrides the template. The Byteforge brand is that decision for the orange accent: orange marks actions and selection only, never whole surfaces.
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
