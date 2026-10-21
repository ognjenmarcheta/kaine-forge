---
"@repo/desk": patch
---

Add a separate `revision` field to the planner output contract so a revised plan keeps `summary` as the description of the whole change. The field is a required, nullable string (`nonEmpty.nullable().default(null)`).
