# UI quality checklist

Go through this list before you ask for review of a UI change. Each line names the rule in `docs/ui/guidelines.md` that explains it. In a review, cite the rule ID.

## Run

- [ ] `pnpm ui:check` passes: accessibility lint, token-only CSS, theme contrast, and target sizes.
- [ ] `pnpm check:affected` passes.
- [ ] After a theme change, `pnpm theme:build` ran and its output is committed.

## Look at it

Open the screen in light and dark, at 375px and at full width, in the default theme and one other theme.

- [ ] The structure fits the task: a table, a list, a split view, or a form (LAYOUT-1). No card sits inside a card (LAYOUT-3).
- [ ] The page has one `PageHeader` and headings in order (LAYOUT-2, TYPE-2).
- [ ] Nothing moves when data loads; skeletons hold the space (LAYOUT-5, PERF-3).
- [ ] There is one filled primary action (COLOR-4).
- [ ] The page does not scroll sideways at 375px; wide tables scroll inside themselves (RESP-1).

## Use it with the keyboard

- [ ] Tab reaches every control in reading order and the focus ring shows on each (A11Y-1).
- [ ] Dialogs trap focus, close with Escape, and return focus (A11Y-4).
- [ ] Composite widgets, such as menus, tabs, and segmented controls, move with the arrow keys.

## States

- [ ] Loading, empty, error, and content states exist and look intended (STATE-1).
- [ ] A failed write keeps the input and shows the error beside the action (STATE-3).
- [ ] A pending submit cannot be sent twice (FORM-4).

## Content and accessibility

- [ ] Every string comes from a translation key, including `aria-label` (COPY-1).
- [ ] Every field has a visible label; errors are text tied to the field (FORM-1, FORM-2).
- [ ] Status is never color alone (COLOR-2); icon-only buttons have names (A11Y-3).
- [ ] Charts have a title and the data as text (A11Y-7); numbers show units (DATA-3).
- [ ] Motion stops under reduced motion (MOTION-3).
- [ ] Product screens show real data only (DATA-1).

## When recreating a reference

- [ ] The palette, type, shape, density, and depth follow the reference, through a theme rather than one-off values.
- [ ] Each change the MUST rules forced is listed as a deviation with its rule ID.
