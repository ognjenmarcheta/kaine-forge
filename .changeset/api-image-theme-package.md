---
"@repo/api": patch
---

The API image now includes `@repo/theme`, which the API imports since the themeable design system.
Without it every container crashed at start, so deploys since 29 October kept running the old API.
The image build now fails when a workspace package the API imports is missing.
