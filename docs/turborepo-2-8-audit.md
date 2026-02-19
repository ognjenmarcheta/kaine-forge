# Turborepo 2.8 Adoption Audit

- Date: 2026-02-19
- Source: https://turborepo.dev/blog/2-8

## Status Matrix

| 2.8 Advantage                     | Status                 | Evidence in this Repo                                                                                       | Notes / Next Step                                |
| --------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Task descriptions in `turbo.json` | Adopted                | `turbo.json` has `description` on all major tasks (`build`, `dev`, `lint`, `typecheck`, `db:*`, `generate`) | Keep descriptions updated when adding new tasks. |
| Improved TUI defaults             | Adopted                | Root `turbo.json` sets `"ui": "tui"` and root `package.json` uses `turbo@^2.8.10`                           | No change required.                              |
| Better worktree cache support     | Adopted by version     | Repo uses Turbo 2.8.10 and has active worktrees (`git worktree list`)                                       | No extra configuration required.                 |
| `turbo docs` command              | Available              | `pnpm exec turbo --help` includes `docs` command                                                            | Team convention documented in `CONTRIBUTING.md`. |
| Agent skills for Turborepo        | Not adopted (optional) | No Turborepo-specific agent integration files in repo                                                       | Evaluate later only if AI workflow needs it.     |

## Gaps and Decisions

1. No blocking adoption gaps were found for Turbo 2.8.
2. Keep Turbo version on `2.8.x` or newer in root `package.json`.
3. Document `turbo docs` usage for contributors to speed up troubleshooting and discovery.
