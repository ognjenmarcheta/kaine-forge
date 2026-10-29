# Lab screens

Each folder recreates one reference image with the template's components and a theme. The lab finds a screen by its file name, so a new screen never edits a shared file. Each screen loads on its own: a screen that does not compile yet shows as "did not load" in the gallery, and the other screens keep working. `lab.registry.test.ts` still fails until every screen loads.

```text
src/screens/<id>/
  <id>.theme.ts     the look of the reference, made with createTheme
  <id>.screen.tsx   exports `screen: LabScreen`
  <id>.notes.md     the theme axes you read, every deviation with its rule ID, and the measured lengths
```

`<id>` is the reference number and a short name, such as `10-medspa`. The reference image goes in `public/references/` (gitignored); never commit it.

## Compare

`#/screens` lists every screen. A card opens `#/compare/<id>`, which has three modes:

- **Side by side**: the reference and the recreation at the frame size. Click the reference to see it large.
- **Slider**: the reference over the recreation, split by a divider. Drag it, or focus it and use the arrow keys (Shift moves 10%). Switch between a vertical and a horizontal line.
- **Overlay**: the reference over the recreation, with an opacity, or as a **Difference** that turns matching pixels black. Use it to find the last misplaced pixels.

`pnpm lab:diff [id …]` prints the share of pixels that still differ from the reference (gray values more than 40 apart) and writes `shots/<id>.diffmap.png` with them in red. Agents use it to measure each change.

Slider, overlay, and `lab:diff` only line up when the reference shows the app at the frame size. When the image has a backdrop, a browser window, or a device around the app, set `referenceCrop` on the screen: the rectangle of the app in the image's own pixels. The "Align reference" panel finds the numbers and gives the line to paste.

## Rules

- Follow `kaine-build-ui` in reference-image mode and `docs/ui/guidelines.md`.
- Name the theme `lab-<id>` and build it with `createTheme` from `@repo/theme`. Lab themes never ship.
- Use `@repo/ui` components and the theme utilities only: no hex values, no default Tailwind palette, sizes, or shadows, and no arbitrary `[var(--ds-*)]` values. A length measured from the reference may be an arbitrary value, such as `w-[24.875rem]`, when no step is that length; list each one under `## Measured lengths` in the notes (SPACE-1). For any other value the theme cannot express, choose the nearest token and list the deviation.
- Every visible control does something (DATA-6). A control that the reference shows with no data behind it gets sample content: search opens a `CommandMenu` (through `SearchTrigger`), notifications open a menu of sample items, and share, open, export, and similar buttons open a small dialog.
- Keep fixture data in the screen file as typed constants. Replace logos, photos, and illustrations with neutral placeholders (initials avatars, icons, or plain surfaces). Never copy a third-party logo or brand name; use a neutral product name.
- For motion, use a named property with the motion utilities: `transition-colors duration-control ease-standard`. Never `transition-all` or an arbitrary duration.
- The screen must work by keyboard, pass the theme's contrast pairs, and reflow at 375px.

## Example

```tsx
import { PageHeader } from "@repo/ui";

import { exampleTheme } from "./00-example.theme";
import type { LabScreen } from "../../lab.registry";

function ExampleScreen() {
  return <PageHeader title="Overview" />;
}

export const screen: LabScreen = {
  id: "00-example",
  title: "Example",
  theme: exampleTheme,
  mode: "light",
  width: 1440,
  height: 900,
  reference: "00-example.png",
  // Only when the image has a backdrop or a frame around the app.
  referenceCrop: { x: 64, y: 108, width: 896, height: 560 },
  Component: ExampleScreen
};
```
