# ADR 0024: worktrunk as the optional worktree manager

- Status: Accepted
- Date: 2026-11-03

## Context

ADR 0013 made GitButler the recommended client, so parallel sessions share one checkout. A
session still needs its own git worktree when it needs its own runtime state: a dev server, build
output, or a long test run. With plain git, that worktree takes several manual steps: add it,
change into it, run `pnpm install`, copy `.env` and the personal AI setup, run `pnpm ai:install`,
then start the agent. Every worktree also used web port 3000 and API port 4000, so only one
worktree could run `pnpm dev` at a time.

worktrunk (`wt`, `max-sixty/worktrunk`, MIT or Apache-2.0) is a Rust CLI for git worktrees.
`wt switch -c -x claude <branch> -- '<task>'` creates the branch and the worktree, runs the
project hooks, and starts the agent in the worktree. `wt list` shows every worktree with its
diff state, agent activity, and dev-server URL. Its `hash_port` template filter maps a branch name
to a stable port from 10000 to 19999.

Three facts limit what it gives this repository:

- Its copy-on-write sharing of `node_modules` and build caches needs APFS, btrfs, XFS, or ReFS.
  On ext4, which the owner's machine uses, every copy is a full copy.
- `wt merge` squashes, rebases, and fast-forwards the local target branch, usually `main`, and
  rewrites the target's worktree. `wt step push` fast-forwards the local target. Neither pushes,
  but both merge without a pull request.
- `wt list`, `wt remove`, and `wt step prune` see every git worktree, the agent desk's included.

## Decision

worktrunk is optional tooling for each machine, pinned to 0.81.0. GitButler stays the
recommended client. The agent desk keeps its own tested worktree engine
(`tooling/desk/src/worktree/worktree.create.ts`).

- **Project config.** `.config/wt.toml` runs a blocking `pre-start` pipeline, so `-x` starts the
  agent only in a ready worktree: `wt step copy-ignored --require-include` copies what
  `.worktreeinclude` lists (`.env`, the personal AI setup files, `.turbo/`), then
  `pnpm install --frozen-lockfile --prefer-offline`, then the `./packages/*` build (mostly cache
  hits from the copied `.turbo/`), `scripts/worktree-env.mjs`, and `pnpm ai:install --auto`.
  `node_modules` and `.tauri-target` are not copied: pnpm hardlinks from its store, which is
  faster than a full copy on ext4. `.gitignore` ignores `.ai.local/*`, not `.ai.local/`, so
  `.worktreeinclude` can pick single files there. Claude Code desktop reads the same
  `.worktreeinclude` when it creates a worktree.
- **Ports.** `scripts/worktree-env.mjs` gives a linked worktree its own `WEB_PORT` and
  `API_PORT` and moves every loopback URL in that worktree's `.env` with them. It refuses the
  primary checkout. Vite reads `WEB_PORT`; everything else already read `.env`. The worktrunk
  hook passes `hash_port` values; a plain-git worktree can run it by hand.
- **Guards.** `.ai/permissions.json` denies `wt merge` and `wt step push`, and asks before
  `wt step prune` and `wt remove` with `--force`, `-f`, `--force-delete`, or `-D`. The matcher
  moves `wt`'s leading global options (`-C`, `--config`, `--config-set`, `-y`) after the
  subcommand, so `wt -C . -y merge` still matches.
- **Status.** `.ai/hooks/worktrunk-cli.mjs` holds the version pin and the `wt --version` probe.
  The SessionStart hook and `pnpm doctor` print its `Worktrunk:` line.

## Alternatives considered

- **Require worktrunk.** Rejected. Most sessions share one checkout through GitButler and need
  no worktree.
- **Move the agent desk onto worktrunk.** Rejected. The desk's engine has attach and reuse
  modes, a clean-tree check, and tests; worktrunk's approval prompt does not fit a headless run.
- **A database per worktree.** Deferred. Worktrees share `monorepo_dev` and the RustFS buckets.
- **Plain-git scripts of our own.** Rejected. worktrunk already covers creation, hooks, cleanup,
  `wt list`, and the agent plugins.

## Consequences

- Pros:
  - One command creates a ready worktree and starts an agent in it.
  - Several worktrees run `pnpm dev` at the same time, each on stable ports.
  - `wt list` shows every worktree, its agent activity, and its URL in one place.
- Cons:
  - On ext4, each new worktree still runs `pnpm install` and copies `.turbo/` in full.
  - Worktrees share one database, so a migration in one worktree reaches all of them.
  - `pnpm dev:desktop` stays on port 3000 (`tauri.conf.json` `devUrl`), so it runs only in the
    primary checkout.
  - Each machine approves the project hooks once, and again after `.config/wt.toml` changes.
