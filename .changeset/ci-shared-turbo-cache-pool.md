---
"@repo/config": patch
---

Share one Turbo cache restore pool across CI jobs instead of two isolated namespaces.

`check-fast` saved under `turbo-check-*` and `build-core` under `turbo-build-core-*`, with each job's `restore-keys` scoped to its own prefix. Turbo's local cache is content-addressed by task hash (`<hash>.tar.zst`), so those namespaces stored overlapping artifacts twice and neither job could ever reuse the other's work — against a 10 GB per-repo cache cap.

Save keys stay unique per job and commit, because GitHub cache entries are immutable and a shared save key would make every job after the first fail to save. Only the restore prefix is unified, to `turbo-${{ runner.os }}-`, so any job restores the newest Turbo cache from any prior job or run.

No cache step was added to `mobile-typecheck` or `graphql-schema`: the former invokes `tsc` through `pnpm --filter` rather than Turbo, and the latter's `generate` task is `cache: false`, so neither would benefit.

Remote caching remains opt-in through the existing `TURBO_TOKEN`/`TURBO_TEAM` wiring. It is worth enabling now that `CI` is no longer part of the global hash — before that, a CI-produced cache entry could never be restored on a developer machine.
