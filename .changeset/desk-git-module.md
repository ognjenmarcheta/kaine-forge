---
"@repo/desk": patch
---

Run every desk git command through the git module, with one git environment (no prompt, no optional locks, no editor) and one branch-name rule. Worktree setup now creates the worktree through `GitPort`.
