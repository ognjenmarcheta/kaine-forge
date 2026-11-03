---
"@repo/desk": minor
"@repo/desk-ui": patch
"@repo/translation": patch
---

The agent desk no longer stops when a provider CLI is missing. Before each run it checks which of Claude Code, Codex, and OpenCode run, keeps the provider the role asks for when it can, and otherwise moves the run to the best other one with a note in the history. Desk jobs follow the same rule. A new config opt-in, `allowCodexBuilder`, lets Codex change code, and Setup offers it as a fix. A step that no CLI can run stops with the new code `no-provider`, and the step rail names the provider that ran.
