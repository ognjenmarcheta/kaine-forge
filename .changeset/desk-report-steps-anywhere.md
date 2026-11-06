---
"@repo/desk": minor
"@repo/desk-ui": minor
---

A report step can go anywhere in a flow. A gate after the plan stays the plan approval when
report steps sit between them, and the validator applies the same rule. Every agent step now
reads the reports of earlier report steps as fenced advice, and a rerun after feedback also reads
the reports on its earlier output. The plan gate shows the reports on the plan.
