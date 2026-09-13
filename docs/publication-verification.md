# Temporary publication verification

This branch verifies the public repository's required checks and owner-controlled
merging. Its PR first uses an intentionally invalid title to fail Commitlint.
After recording the blocked merge state, the title is corrected and fresh PR
checks run. The PR is then closed without merging.

No application behavior, permissions, or required check is weakened by this file.
Do not merge this verification PR.
