---
"@repo/ui": minor
---

Common composed parts take the options that screens rebuilt locally. Every option is opt-in, so current screens render as before.

- `StatCard`: a `delta` takes `appearance="text"` and an `icon` (`null` for none). `deltaPlacement="below"`, `iconPlacement` (`start`, `end`, `leading`), and `wrap={false}` set the layout.
- `TopNav`: `appearance="filled"`, `itemWidth="equal"`, and `size` (`medium`, `large`, `xlarge`).
- `FilterMenu`: `show="label"`, `chevron={false}`, `size`, `width="widest"`, and `multiple` for checkboxes.
- `Badge`: `emphasis="outline"` and `appearance="selected"`.
- `Avatar`: sizes 28, 36, and 44. `AvatarFallback` takes the `chart-1` to `chart-6` tones. `AvatarGroup` takes `overlap="sm"` and `overflowTone`.
- `Card`: `CardIcon` puts an icon well before the title. In a card marked `@container/card`, `CardAction` moves under the title when the card is narrow.
- `NavUser`: `user.role`, `avatarTone`, a `status` dot, and `trailingIcon="chevrons"`.
- `PageHeader`: `descriptionSize`. A wide actions bar now wraps or scrolls inside the header instead of widening the page.
- `TableHead`: `onSort` and `sort` make a sort button with `aria-sort`.
- `Kbd`: `shortcut={{ apple, other }}` shows ⌘ on Apple devices and Ctrl elsewhere, with stable server rendering. `useApplePlatform` is exported.
- New `SearchTrigger`: a button that looks like a search field, with the shortcut hint, to open a `CommandMenu`.
