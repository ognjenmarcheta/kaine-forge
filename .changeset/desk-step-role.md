---
"@repo/desk": patch
"@repo/desk-ui": patch
---

Derive a flow step's role in one contract function and send it on `FlowStepView.role`. Only a ship gate accepts a ship confirmation, so the CLI no longer suggests `ship --confirm` before an automatic ship.
