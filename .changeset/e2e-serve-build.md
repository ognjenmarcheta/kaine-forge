---
"@repo/e2e": patch
"@repo/web": patch
---

Serve the built API and web app in the CI PR e2e job when `E2E_SERVE_BUILD=true`, instead of the tsx API and the Vite dev server. Local runs and Release keep the dev servers. The web build adds the Playwright fixture page only with `E2E_FIXTURES=true`; the shipped build is unchanged.
