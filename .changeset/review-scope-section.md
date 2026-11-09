---
"@repo/desk": patch
---

The reviewer's output contract adds the `Scope` section of `REVIEW.md`. A new review must give
Scope a verdict and name the primary intent in its notes, and lists adjacent work under "Out of
scope" in its PR draft. A `review.json` stored before this change, without `Scope`, still reads.
