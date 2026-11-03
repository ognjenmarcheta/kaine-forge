---
"@repo/desk": minor
"@repo/desk-ui": minor
"@repo/translation": minor
---

The agent desk can fix a PR until merge. The Board's Open pull requests list shows each PR's CI and
review state. A desk PR offers Check CI and comments, which reads what a fix round would read and
keeps a summary, and Address feedback, which runs the PR feedback round. A fresh list notices a
merged desk PR and moves its issue to done with the merge date, which the Done list shows and sorts
by. A new PR carries its issue's `source:*` labels, and the desk trusts the usual review bots
(CodeRabbit, GitHub Actions, Copilot) by default.
