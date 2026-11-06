---
"@repo/desk-ui": patch
"@repo/desk": patch
"@repo/translation": patch
---

The scorecard review gate now reads top to bottom: the score tiles and the plain-language result,
the dimensions that moved, each open question in its own numbered block, the proposed issues as
cards with label tags, and the decision. The technical summary and evidence are folded. The other
job gates use the same question blocks and issue cards. The scorer prompt asks for a summary of
at most three sentences.
