# Turborepo Cache & CI Performance Budget

- Last updated: 2026-07-23
- Turbo: `^2.8.10` (see root `package.json`)
- Source notes: https://turborepo.dev/blog/2-8

## Feature adoption

| Capability                            | Status             | Evidence                                                                              |
| ------------------------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| Task descriptions                     | Adopted            | All tasks in `turbo.json` have `description`                                          |
| TUI defaults                          | Adopted            | `"ui": "tui"`                                                                         |
| Worktree cache                        | Adopted by version | Turbo 2.8.x                                                                           |
| `globalDependencies` / `globalEnv`    | Adopted            | Root config hashes `tsconfig.base.json`, ESLint, workspace, lockfile; `NODE_ENV`/`CI` |
| Task `outputs: []` for lint/typecheck | Adopted            | Cacheable no-artifact tasks                                                           |
| Build `env` hashing                   | Adopted            | Vite/Expo public build vars listed on `build`                                         |
| typecheck without `^build`            | Adopted            | Source `paths` resolution; faster local/CI typecheck                                  |
| Remote cache                          | Optional           | `TURBO_TOKEN` + `TURBO_TEAM` in CI; documented in README/CONTRIBUTING                 |
| Affected PR gate                      | Adopted            | `turbo run … --filter=...[origin/<base>]` on pull_request                             |
| `turbo docs`                          | Available          | Documented in CONTRIBUTING                                                            |

## Performance budget (targets)

| Metric                                 | Target                           | Notes                                                   |
| -------------------------------------- | -------------------------------- | ------------------------------------------------------- |
| PR `check-fast` when 1 package changes | Prefer affected-only Turbo tasks | Full coverage still runs as quality floor               |
| Cache hit rate on main rebuilds        | ≥50% with remote cache enabled   | Measure via Turbo summary / Vercel dashboard            |
| Package count before re-evaluating CI  | ~25–30 workspaces                | Then consider splitting coverage and install strategies |
| Local pre-push                         | Affected typecheck vs upstream   | Falls back to full `pnpm typecheck`                     |

## Gaps still optional

1. Agent-specific Turborepo skills — only if AI workflows need them.
2. Package emit simplification (`tsc` + `fix-esm-extensions` vs tsup) — see monorepo platform backlog; not a Turbo config item.
3. Strict peer dependencies — trial on a branch when peer noise is low.
