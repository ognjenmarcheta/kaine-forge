---
"@repo/api": patch
---

AI todo generation drops a draft with a blank title before it writes anything. Before, such a draft
answered `AI_GENERATION_FAILED` while the todos created before it stayed stored and published.
