---
name: kaine-build-3d
description: Add or change an interactive 3D view in the web or desktop UI with @repo/ui-3d — decide whether 3D is needed, then build an accessible, theme-colored, on-demand scene that a DOM control drives.
argument-hint: screen and the spatial question the 3D view answers
---

# Build a 3D view

Read `docs/ui/3d.md` first, and rule A11Y-8 in `docs/ui/guidelines.md`. Follow `kaine-build-ui` for the rest of the screen.

## Goal and non-goals

Ship a 3D view that answers a spatial question, works without the canvas, follows the theme, and costs nothing while idle. Do not add postprocessing, WebGPU, environment maps, or remote assets. Do not put data or selection state in the scene. Do not edit `@repo/ui-3d` to fit one screen; report the gap.

## 1. The gate

Write one line: what spatial question the person answers with the view. If a diagram, chart, list, or image answers it, stop and use that. 3D passes when position or shape in space is the information (where on the body, how parts fit, what is behind something).

## 2. State and the real control

1. Keep the data and the selection in React state.
2. Render a DOM control for it beside the viewer, with translated names: a radio group, a list, or a select. Give every selectable part a typed id that the control and the scene share.
3. Pass `announcement` (for example "Left knee selected") and `onClearSelection` to `Viewport3D`.

## 3. Accessibility (WCAG 2.2)

`Viewport3D` gives an `aria-hidden` canvas, a focusable region with `labels.viewer` and `labels.keyboardHelp`, a token focus ring, arrow keys, `+`/`-`, Home, and Escape, 24px+ turn and zoom buttons, a polite live region, reduced motion (snap, no auto-turn), and the fallback. You still:

- translate every label you pass in;
- keep the bottom start corner free for the buttons, and give the viewer about 300px of height on phones;
- pass `tilt` with its button labels only if people need to see the model from above or below;
- make `fallback` useful: a poster plus a pointer to the control.

## 4. Theme tokens

1. Color materials only with `useThemeMaterials` from `@repo/ui-3d/scene`, one material per state, with a constant token object. Never a hex value or a three.js color constant.
2. Measure each pair in the screen's theme test with `contrastRatio` from `@repo/theme`, in both modes: base on the background, highlight on the base, highlight on the background, all 3:1.
3. Pass the highlight in `keepColor`. If the base is lighter than the highlight, the base needs about 4.3:1 against it at the token level, because lit faces shade to 70%.
4. Tokens must resolve to hex; an eight-digit hex becomes opacity, not color.

## 5. Lifecycle and performance budgets

- Put three.js code in a `*.scene.tsx` module that the screen loads with `React.lazy`.
- Share geometries in `useMemo` and dispose them in an effect cleanup. Fiber disposes what it creates, not objects you pass in or cache.
- Never call `setState` in `useFrame`; mutate refs and scale motion by `delta`.
- Budgets: fewer than 100 draw calls (one per mesh), zero frames while idle, flat `geometries` and `textures` across selection changes, theme changes, and remounts. Read them from `data-render-stats`.

## 6. Loading and bundle cost

- Only the scene module and `@repo/ui-3d/scene` import three; the root `@repo/ui-3d` entry must stay three-free.
- Import drei parts by name. Use `WebGLRenderer` (the default), not WebGPU: WebKitGTK in the desktop app may not support it.
- Report the size of the three chunk from a production build.

## 7. Assets and licenses

Prefer procedural geometry (capsule, sphere, lathe). For real models: MakeHuman and Quaternius are CC0; reject Z-Anatomy (CC BY-SA) in the template, and NIH 3D entries marked NC or ND. Self-host files and decoders (`useGLTF.setDecoderPath`).

## 8. Testing

Apply `kaine-test`. Unit-test the pure model (ids, mirroring, part budget). Test the fallback in jsdom (no WebGL). In the browser: `data-render-stats`, axe in light, dark, and 375px, the keyboard path, reduced motion, and Chromium with `--disable-webgl`.

## Gotchas

- Fiber augments JSX from its own folder, where pnpm links no `@types/react`; `@repo/ui-3d/scene` repeats the augmentation. Import it in every scene module, or `<mesh>` fails to typecheck.
- `react/no-unknown-property` flags three.js props; the lint config turns it off for `*.scene.tsx` only.
- An inline callback to drei `Center` (`onCentered`) re-measures on every render and loops; keep callbacks stable.
- With `frameloop="demand"` the first frame after a pause reports the pause as `delta`; clamp it, or moves jump.
- Tailwind does not scan packages it is not told about: apps import `@repo/ui-3d/styles.css`.
- fiber 9.8 with three 0.186 logs a `THREE.Clock` deprecation warning; it is harmless.

## Canonical commands

```bash
pnpm --filter @repo/ui-3d test
pnpm --filter @repo/ui-lab test
pnpm ui:check
pnpm lab:shots <screen-id>
```

## Report

Name the spatial question, the control, the token pairs with their ratios, the draw calls and idle frames from `data-render-stats`, the three chunk size, and the deviations with rule IDs.
