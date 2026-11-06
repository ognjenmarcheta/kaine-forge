---
"@repo/desk": patch
---

"Allow this command and retry" now tells the agent that the command is allowed. Before, it only restarted the stage, and a resumed agent that remembered the refusals did not try the command again (issue 864 stopped a second time without a Bash call). Allow and skip both send the stage feedback now.
