---
"@repo/desk": minor
"@repo/desk-ui": minor
"@repo/translation": minor
---

The agent desk adds two lab jobs (ADR 0021). Build component plans a new @repo/ui component, waits
for your approval of the plan, then builds it with its test and a lab specimen, and opens a draft
PR with its changeset. Audit screen checks a lab screen against the UI guidelines, WCAG 2.2, and
its reference image, and files only the findings you tick. The lab gains a Specimens page.
