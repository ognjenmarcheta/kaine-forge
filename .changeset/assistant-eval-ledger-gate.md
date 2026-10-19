---
"@repo/api": minor
---

Add a committed assistant live-eval summary ledger with `eval:assistant record`, which refuses a run whose pass rate falls below the previous run for the same provider, model and dataset. The golden-set coverage floor now follows the real tool set, and a new `list-then-rename-note` case expects `updateNote`.
