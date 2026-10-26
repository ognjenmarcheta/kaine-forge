---
"@repo/e2e": patch
---

Serve the built API and web app in the CI PR e2e job when `E2E_SERVE_BUILD=true`, instead of the tsx API and the Vite dev server. Local runs and Release keep the dev servers.
