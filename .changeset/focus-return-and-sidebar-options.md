---
"@repo/ui": minor
---

Dialogs, the command menu, and radios fix three focus and contrast bugs, and the sidebar primitives take four opt-in options.

- `Modal` (so also `ConfirmModal`, `FormModal`, and `ConfigFormModal`), `AlertDialogContent`, and `SheetContent` return focus to the element that opened them. A dialog opened from a menu item returned focus to the page body, because the item goes away with its menu; it now returns focus to the menu's trigger, through sub-menus, or for a context menu to the element focused before the menu opened. `useDialogReturnFocus` gives the same behavior to another Radix dialog.
- `CommandMenu` closes itself when a command is picked, gives focus back to its opener, and then runs the command. A command can open a dialog, whose focus then returns to the opener, or move focus, which the menu no longer takes back. A screen no longer waits on a timer for the menu to close.
- `RadioGroupItem` draws its ring in the field border, which reaches 3:1 on every surface; the old border was about 1.3:1 (WCAG 2.2 SC 1.4.11).
- `Sidebar` takes `label`, which wraps the sidebar in a named navigation landmark, and `surface` (`sunken`, `default`, or `raised`) for its fill. `SidebarMenuButton` takes `variant="neutral"` for a current item in the neutral fill without the start indicator. `SidebarMenuSub` takes `tree` for tree lines.
