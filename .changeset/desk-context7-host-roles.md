---
"@repo/desk": patch
---

Issue worktrees get the Context7 MCP server next to Serena, and every desk role may use its two read tools, so the planner and the reviewer can look up library docs on the host. The Docker builder stays offline. The builder may run one test file with `pnpm --filter <workspace> exec vitest run <path>`, and the reviewer reads the engine's `check-report.json` instead of running checks. Review starts only when that report passed for the current diff; otherwise the issue stops with the command to run the checks again.
