---
"@repo/config": patch
---

The server-only import block for client workspaces now also covers `@repo/billing` and every
`@repo/jobs` entry, so a client import of the payment SDKs or the job queue fails lint.
