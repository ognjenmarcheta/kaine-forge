---
"@repo/desk": minor
"@repo/desk-ui": minor
"@repo/translation": patch
---

The issue header shows the active time of a finished issue beside the total. The active time
leaves out the waits at a gate, the open pull request, and a stop in `needs-you`, so a PR that
sat on GitHub for hours no longer counts as work.
