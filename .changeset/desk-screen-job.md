---
"@repo/desk": minor
"@repo/desk-ui": minor
"@repo/translation": minor
---

The agent desk recreates a reference image as a lab screen in a desk job (ADR 0021). Recreate
screen in the Lab view uploads the image; the job builds the screen in its own worktree and lab
server with the Playwright browser, may write only its screen folder, and passes the lab checks
and `lab:diff`. At the gate you open the live compare view, then approve to push the folder as a
draft PR.
