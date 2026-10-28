# UI quick start

Kaine Forge ships one default theme, **Byte Forge**, and one example custom theme, **Moss**. The web app, the desktop app, the agent desk, and the mobile app read the same `--ds-*` tokens, so a theme changes all of them at once.

| You want to…                          | Read or run                                     |
| ------------------------------------- | ----------------------------------------------- |
| Build a screen with the default theme | this page, then `docs/ui/guidelines.md`         |
| Recreate a screenshot or a brand look | `docs/ui/guidelines.md` (Precedence)            |
| Create or change a theme              | `docs/ui/create-a-theme.md`                     |
| Check a UI change before review       | `docs/ui/quality-checklist.md`, `pnpm ui:check` |
| See the default theme's look          | `DESIGN.md` (generated from `packages/theme`)   |
| Look up a token or a rule's reason    | `DESIGN_SYSTEM.md`                              |
| Add a 3D view                         | `docs/ui/3d.md`                                 |

## Build a screen

1. **Use the components.** Web and desktop code imports from `@repo/ui`; mobile code imports from `@repo/mobile-ui`. Start a page with `PageHeader`, show lists in a `Table` or work rows, and use `EmptyState`, `QueryError`, and `Skeleton` for the other states.
2. **Style with theme utilities.** Each `--ds-*` token has a Tailwind utility:

   ```tsx
   <section className="grid gap-ds-150 rounded-card bg-ds-surface-raised p-card shadow-card">
     <h2 className="text-heading-sm text-ds-text">{t("billing.title")}</h2>
     <p className="text-body text-ds-text-subtle">{t("billing.description")}</p>
   </section>
   ```

   Colors are `text-ds-*`, `bg-ds-*`, and `border-ds-*`; spacing is `p-ds-*` and `gap-ds-*`; type is `text-heading-*` and `text-body*`; shape and depth are `rounded-*` and `shadow-*`. The default Tailwind palette, sizes, and shadows are switched off, and the linter rejects raw colors and arbitrary `[var(--ds-*)]` values.

3. **Translate every string** and pass it to the components as props.
4. **Check it** with `pnpm ui:check` and the quality checklist, in light and dark.

## Appearance and themes

- **Appearance** is light, dark, or system. Each person picks it under Appearance; the page applies it as `data-color-mode` before the first paint.
- **The Organization Theme** is the theme everyone in an Organization sees. A member with the `organization:update` Permission picks it in Organization settings; the page applies it as `data-theme`. Signed-out pages use the default theme.

## Where things live

| Path                                                   | What                                           |
| ------------------------------------------------------ | ---------------------------------------------- |
| `packages/theme/src/themes/<name>/`                    | a theme: `<name>.theme.ts` and its `DESIGN.md` |
| `packages/theme/src/themes.config.ts`                  | the registered themes and the default          |
| `packages/ui/src/styles/tokens.generated.css`          | generated web tokens and utilities             |
| `packages/ui/src/styles/globals.css`                   | fonts and shared component CSS                 |
| `apps/web/src/features/<feature>/<feature>.styles.css` | CSS that one web feature owns                  |
| `packages/mobile-ui/src/lib/design-tokens.ts`          | generated native tokens, palettes, and fonts   |
| `packages/config/tailwind/preset.tokens.js`            | generated NativeWind utilities                 |

## Commands

| Command            | What it does                                                                   |
| ------------------ | ------------------------------------------------------------------------------ |
| `pnpm theme:build` | checks every theme, then writes the generated token files and each `DESIGN.md` |
| `pnpm theme:check` | the same checks; fails when a generated file is out of date                    |
| `pnpm ui:check`    | the UI rules: accessibility lint, token-only CSS, and the theme check          |
| `pnpm lab`         | the UI lab: every component under every theme, and the recreated screens       |
