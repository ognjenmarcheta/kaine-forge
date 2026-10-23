# ADR 0013: GitButler as the recommended version-control client

- Status: Accepted
- Date: 2026-10-23

## Context

The owner and several agent sessions often work on the repository at the same time. With plain
git, each session needs its own worktree, its own `pnpm install`, and its own build output, or
the sessions overwrite each other's branch state. The agent guidance only described plain git:
`git switch -c`, `git push -u`, and `gh pr create`.

GitButler applies several branches in one checkout on a managed `gitbutler/workspace` branch.
Each change goes to the branch that the commit names, so parallel sessions can share one
checkout. Its `but` CLI covers commit, stacked branches, history edits, undo, push, and pull
requests. Its MCP server shows the workspace and the pull request state to agents.

Two facts change the repository's guarantees in GitButler mode:

- `but commit` does not run the `pre-commit` or `commit-msg` hooks. So commitlint and the
  no-AI-co-author rule did not run at commit time. `but push` and `but pr new` run
  `pre-push`, but GitButler skips every hook under `.husky` unless the per-project setting
  "Enable Husky hooks" is on. It is off by default. This repository's hooks live in
  `.husky/_` (`core.hooksPath`), so by default no local hook runs in GitButler mode.
- `but land` pushes a branch straight onto the target without a pull request, and
  `but pr auto-merge` turns on automatic merging. Only the owner merges into `main`.

## Decision

GitButler is the recommended local client. Plain git stays fully supported.

- **Guidance.** `.ai/guide.md` has a "Version Control with GitButler" section. On
  `gitbutler/workspace`, agents use `but` for every write, use one branch per session with the
  `KAINE-*` name, and open pull requests with `but pr new --draft`. `kaine-open-pr` and
  `kaine-rebase` have GitButler steps. Each contributor installs GitButler's own skill with
  `but skill install`; the repository does not vendor it, so it follows the CLI version.
- **Guards.** `.ai/permissions.json` denies `but land`, `but pr auto-merge`, and the
  `--no-verify` and `--no-hooks` flags on any `but` command. It asks on force-push flags. The
  matcher skips `but`'s global flags (`-C`, `--current-dir`, `--json`, `--status-after`) and
  treats `-m` and `-F` values as data.
- **Commit-message gate.** `.husky/pre-push` runs commitlint on every pushed commit range. This
  gives GitButler commits the same local check that `commit-msg` gives plain git commits, once
  the contributor turns on "Enable Husky hooks". The guide also tells agents to run commitlint
  before `but push`. CI still runs commitlint on every commit of a pull request.
- **MCP.** `.ai/mcp.json` has an opt-in `gitbutler` server (`but mcp serve`). Claude
  auto-allows its five read-only tools. `gitbutler_mark_review_ready` stays prompted. The
  Agent Desk does not list the server in any capability profile and keeps its plain-git
  worktrees.

## Alternatives Considered

- Require GitButler: contributors without it, CI, and the Agent Desk would need a second
  workflow anyway.
- Default-on MCP server: every contributor without `but` would get a doctor warning and a
  failed server start.
- Vendor GitButler's skill into `.ai/skills/`: it would drift from each contributor's CLI
  version.
- Rely on CI commitlint only: a bad message or an AI co-author trailer would reach the remote
  and fail later, after review time.

## Consequences

- Pros:
  - Parallel agent sessions share one checkout, one install, and one build cache.
  - Stacked pull requests get correct bases from `but pr new`.
  - The merge and hook-bypass guards cover `but` as well as `git` and `gh`.
- Cons:
  - Plain-git contributors run commitlint twice per commit: at commit and at push. It takes
    about a second.
  - `pnpm install` regenerates `.husky/_` and can remove GitButler's workspace guard. Rerun
    `but setup` to restore it (`docs/troubleshooting.md`).
  - The guard rules follow the `but` 0.22.3 flag names. A CLI rename needs a rule update.
  - On `gitbutler/workspace`, `HEAD` has no upstream, so `pre-push` typechecks the whole
    workspace instead of only the changed packages.
