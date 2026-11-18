---
"@repo/web": patch
---

Todos and Notes no longer stop loading in a tab when another tab of the same browser holds the device database. A device storage statement that SQLite turns away with "database is locked" now runs again for up to 5 seconds, outside a transaction only. Before, the busy read crashed the tab's collections until the page reloaded, and that tab showed no changes from other tabs.
