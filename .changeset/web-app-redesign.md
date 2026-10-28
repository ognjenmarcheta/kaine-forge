---
"@repo/ui": minor
"@repo/web": minor
"@repo/api": minor
"@repo/translation": minor
---

The signed-in web app is redesigned for clearer navigation and safer actions.

`@repo/web`: the sidebar groups pages into Workspace (Dashboard, Todos, Notes, Assistant) and Organization (Organization, Audit log). Organization and Account settings are tabbed pages whose tab is in the URL: `/organization/{general,members,roles,data}` and `/account/{profile,security,sessions,notifications,data}`. The old `/members` and `/security` links redirect to the matching tab. The dashboard shows the Active Organization's open Todo, Note, and unread notification counts, a quick add for open Todos, and recent Notes, chats, and activity with "View all" links. Revoking an Invitation, changing a member's role, signing out one or all other sessions, unlinking a sign-in method, declining an Invitation, and requesting account deletion now ask for confirmation and report success. The header has a "Search…" button and a Cmd/Ctrl+K command menu to go to a page, open a settings tab, create an item, switch Organization, or change theme and language. The sign-in page's login and sign-up choice is a link pair kept in `?mode=signup`.

`@repo/api`: GraphQL adds `todoCounts` (`open`, `completed`) and `noteCount`, both counted in the Active Organization from the session.

`@repo/ui` adds `PageHeader`, `EmptyState`, `QueryError`, `SettingsSection`, `StatCard`, `CopyButton`, and `CommandMenu` (built on `cmdk`), and exports `tabsListClassName` and `tabsTriggerClassName` for link-based tab navigation. The active sidebar item uses the selected tokens with an inset start indicator.

`@repo/translation` adds the strings for the new navigation, dashboard, confirmations, and command menu.
