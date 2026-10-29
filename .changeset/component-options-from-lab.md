---
"@repo/ui": minor
---

Component options that designs had to restyle by hand.

- `FilterMenu` takes `iconPlacement="end"`, which puts the icon after the text, before any chevron.
- `StatCard` takes `iconPlacement="top"`, the icon on its own row above the label with the action at its end, and `deltaPlacement="end"`, the description and then the change at the end of the value's line.
- `SidebarTrigger` draws its children in place of the panel icon.
- `SidebarMenuBadge` centers on its row at the logical end, with no state variants, so a caller's `end-*`, `top-*`, and text color hold on hover and on the current link. In an item that holds a submenu, it centers on a default-size link. A badge that set `right-*` or `top-*` for a centered count now needs only `end-*`.
