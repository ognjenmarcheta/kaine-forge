# Lab screens

Each folder recreates one reference image with the template's components and a theme. The lab finds a screen by its file name, so a new screen never edits a shared file.

```text
src/screens/<id>/
  <id>.theme.ts     the look of the reference, made with createTheme
  <id>.screen.tsx   exports `screen: LabScreen`
  <id>.notes.md     the theme axes you read, and every deviation with its rule ID
```

`<id>` is the reference number and a short name, such as `10-medspa`. The reference image goes in `public/references/` (gitignored); never commit it.

## Rules

- Follow `kaine-build-ui` in reference-image mode and `docs/ui/guidelines.md`.
- Name the theme `lab-<id>` and build it with `createTheme` from `@repo/theme`. Lab themes never ship.
- Use `@repo/ui` components and the theme utilities only: no hex values, no default Tailwind palette, sizes, or shadows, and no arbitrary `[var(--ds-*)]` values. If the reference needs a value the theme cannot express, choose the nearest token and list the deviation.
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
  Component: ExampleScreen
};
```
