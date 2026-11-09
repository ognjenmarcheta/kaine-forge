---
"@repo/config": patch
---

The server-only import block for client workspaces now also covers `@repo/auth/audit`, which
reaches `@repo/db` and `node:async_hooks`. A contract test now derives the Node-only entries from
the imports of each package export, so a new entry that reaches Node-only code fails until the
pattern covers it.
