---
"@repo/config": patch
"@repo/auth": patch
"@repo/db": patch
"@repo/email": patch
"@repo/feature-flags": patch
"@repo/logger": patch
"@repo/mobile-ui": patch
"@repo/persistence": patch
"@repo/query": patch
"@repo/storage": patch
"@repo/todos": patch
"@repo/translation": patch
"@repo/ui": patch
---

Close a batch of principal architecture review findings: honest package `dev` scripts, stronger catalog enforcement, fuller `create:package` wiring, Vitest UI/`test:watch`, digest-pinned Docker bases with a blocking Trivy CRITICAL gate, and CI/DX hardening (knip/boundaries on PRs, safer concurrency, caches, launch configs).
