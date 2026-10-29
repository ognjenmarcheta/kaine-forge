---
"@repo/ui": minor
---

More component options that the lab screens had to restyle by hand.

- `SearchTrigger` takes `show="icon"`: only the magnifier in a square button, with the label as its hidden name and no shortcut hint.
- `AppSidebar` takes `headerClassName` and `footerClassName`, after their own padding.
- A `StatCard` `delta` takes `appearance="icon"`: a round tinted chip with only the icon, and the change read, not shown.
- `SegmentedControl` takes `appearance="brand"` for a bold brand surface. Its items keep 4.5:1 at rest, on hover, and chosen.
- `SidebarMenuAction` centers on its row at the logical end with no state variants of its link, as `SidebarMenuBadge` does. An action that set `right-*` or a `peer-data-[size=…]` top now needs only `end-*`.
