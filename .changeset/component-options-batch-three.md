---
"@repo/ui": minor
"@repo/theme": minor
---

The last small component options that designs had to restyle by hand.

- `SidebarMenuButton` takes `variant="brand"`: the current link in brand text and icon on the neutral fill, with no start indicator.
- `CardAction` takes `wrap={false}`, which keeps a short action, such as a period pill, on the title row in a narrow `@container/card`.
- Every theme now passes brand text on the neutral fill (`text-brand` on `background-neutral`, 4.5:1), the pair the brand variant draws.
