---
"@repo/api": patch
"@repo/web": patch
---

Add HEALTHCHECK directives to Dockerfile.api (Node fetch against /health) and Dockerfile.web (wget against nginx)
