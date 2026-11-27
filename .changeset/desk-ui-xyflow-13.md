---
"@repo/desk-ui": patch
---

The flow graph and the flow canvas now run on `@xyflow/react` 13. They read the pane size from `useViewportStore`, and the canvas takes node changes as a `NodeChangeset`. What the desk shows does not change.
