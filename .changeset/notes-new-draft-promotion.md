---
"@repo/web": patch
---

Text typed into a new Note right as its first save finishes now stays with that Note. The draft
moves to its saved id before the page leaves "new", and in that moment an empty draft replaced it,
so the typed text landed in an untitled draft.
