---
"@repo/web": patch
---

A short lock on the device database by another tab of the same browser no longer stops Todos and Notes from loading. A device storage statement that SQLite turns away with "database is locked" now runs again for up to 5 seconds, outside a transaction only. A lock that lasts longer still fails the statement. Before, the busy read crashed the tab's collections until the page reloaded, and that tab showed no changes from other tabs.
