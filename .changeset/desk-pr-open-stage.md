---
"@repo/desk": minor
"@repo/desk-ui": minor
"@repo/translation": minor
---

Add a `pr-open` stage after `ship`. The desk waits there while the owner reviews and merges the draft PR on GitHub. `pnpm desk refresh <n>` (and the `refresh-pr` action, **Check the PR** in the UI) reads the PR once: merged ends the issue at `shipped`, closed ends it at `cancelled`, open changes nothing. The desk does not poll, and it never merges, approves, marks a PR ready, enables auto-merge, or force-pushes. The issue state counts PR feedback rounds against the new `maxPrRounds` config (default 3).
