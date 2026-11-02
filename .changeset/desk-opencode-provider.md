---
"@repo/desk": minor
"@repo/translation": patch
---

The agent desk can run OpenCode 2.2.4+ as the provider of any role, on the host and in Docker
(issue #484). A run uses `opencode run --standalone --format json` with only the desk's rules:
every action is denied first, then the role's allow rules, then its deny rules. `desk doctor`
checks the OpenCode version, flags, and model when a role uses it. The desk UI labels the
provider "OpenCode".
