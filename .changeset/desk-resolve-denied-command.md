---
"@repo/desk": minor
"@repo/desk-ui": minor
"@repo/translation": patch
---

A desk stop that comes from a command the desk refused to an agent now has two buttons on the issue card: "Allow this command and retry" and "Skip it and continue". Allow keeps the exact command for that issue only, as one exact allow rule, and the desk never offers a command that its deny rules refuse. Skip tells the agent to leave the command out. The new `resolve-denial` action and the `deniedCommands` field of the issue detail carry it.
