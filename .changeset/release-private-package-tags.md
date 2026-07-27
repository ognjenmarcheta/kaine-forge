---
---

Enable Changesets tags for private packages so the release workflow can create git tags and GitHub Releases. Harden the tag/release shell steps with `set -euo pipefail`. Gate GitHub Code Scanning upload and Dependency Review so free private templates stay green without GHAS.
