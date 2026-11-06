---
"@repo/desk": patch
---

An issue whose change edits the `.ai/` sources can now ship. After such a build, the engine runs the worktree's `ai:install` command, which no agent may run, so the tracked copies (`AGENTS.md`, `CLAUDE.md`, `REVIEW.md`, and Serena memories with a source) follow their sources. The plan-scope and protected-path rules, and the ship gate, accept those copies; the `pre-push` hook still refuses one that differs from the generator's output.
