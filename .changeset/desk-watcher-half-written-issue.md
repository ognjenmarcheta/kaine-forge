---
"@repo/desk": patch
---

The store watcher no longer reports an issue while its folder exists without `state.json`. A new
issue now sends one `issue-updated` event instead of two, and never a brief `issue-removed`.
