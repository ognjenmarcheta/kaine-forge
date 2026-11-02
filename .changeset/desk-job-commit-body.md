---
"@repo/desk": patch
---

A desk job's ship step wraps the commit body at commitlint's 100 characters, so a long summary from
the agent no longer fails the commit. Issue labels are kept to the labels in
`.github/repo-setup.json`: the job prompts list them, and the desk drops and names an unknown one. A PR label is added through the REST API, because `gh pr edit` fails on gh versions that still read
GitHub's retired classic project cards.
