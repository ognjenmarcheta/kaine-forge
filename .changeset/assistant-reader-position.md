---
"@repo/web": patch
---

The Assistant keeps a reader's place in a long conversation. It decided whether to follow the newest message from the last scroll event, so a re-render in the same frame as the reader's scroll, such as a keystroke in the composer, could pull the list to the end. It now reads the list's position when the messages change.
