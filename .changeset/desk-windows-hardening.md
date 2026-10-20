---
"@repo/desk": minor
"@repo/translation": minor
---

Make the desk run end to end on a Windows host. The default isolation there is `docker`, issue worktrees go next to the main checkout, the Codex runner uses the unelevated Windows sandbox, and the Claude prompt goes on stdin instead of the command line. Docker check containers get CI's loopback `DATABASE_URL` placeholder, and the worker image has `ps`. The builder may run `pnpm turbo run <script> --filter=<workspace>`, which builds what the tests import. `desk doctor` adds rows for agent labels, workspace builds, the Windows Codex sandbox, and worktree path length, with UI fixes for labels and builds. A branch that a background sync fast-forwards to its remote no longer breaks the refs invariant, and `serve` says when another desk holds its port.
