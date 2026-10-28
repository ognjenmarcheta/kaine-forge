---
"@repo/ui": patch
---

`Textarea` accepts a `ref`, so a caller can move focus to it, as with `Input`. Its props type was the plain HTML attributes, which left `ref` out.
