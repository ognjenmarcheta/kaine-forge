---
"@repo/config": patch
---

Add static analysis and container scanning to CI.

New `CodeQL` workflow analyzes `javascript-typescript` with the `security-extended` query pack on push to `main`, on pull requests, and weekly. Results land in the Security tab. Supply-chain coverage was previously `pnpm audit` plus Gitleaks, both of which look at dependencies and secrets — nothing inspected the repo's own code for injection, path traversal, or unsafe sinks.

`docker-images` is now a matrix over api/web instead of two sequential build steps, so the two images build in parallel, and each is scanned with Trivy and gets an SPDX SBOM. Images were built in CI but never scanned, and never produced a bill of materials, even though the `release/<app>` branch contract makes them the deployment artifact.

Trivy uploads SARIF for CRITICAL and HIGH with `ignore-unfixed`, and a second CRITICAL-only pass is `continue-on-error` for now. Blocking is deliberately deferred: the base images are floating tags (`node:22-slim`, `nginxinc/nginx-unprivileged:alpine`), so a newly published CVE in an unchanged base layer would otherwise fail unrelated PRs. Pin the base images by digest, then flip that step to blocking.
