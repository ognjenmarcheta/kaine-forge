# @repo/desk-ui

## 0.1.1

### Patch Changes

- Updated dependencies [cfa361b]
  - @repo/desk@0.1.1

## 0.1.0

### Minor Changes

- cb7174c: Add the `@repo/desk` workspace: the shared stage and agent-output contracts, the pure pipeline
  transition table, the per-issue state store with a process lease, and the desk configuration
  loader for the upcoming local agent desk. Add the GitHub intake path: the `gh` port, owner
  authorization, the issue contract reader, `agent:*` execution labels, the status comment, the
  worktree bootstrap plan, `desk doctor`, and the `start`, `status`, and `labels sync` commands.
  Add the pipeline engine: the stage runner with engine invariants around every agent run, the
  scheduler, process leases, and restart recovery.
  Add the engine commands (`approve`, `feedback`, `continue`, `cancel`, `remove`, `logs`, `resume`), live progress, a persistent redacted agent log, and a `notifyCommand` that runs without a shell.
  Add the ship step: `ship --dry-run` and `ship --confirm` commit, push, and open a draft PR through the repository hooks after a fail-closed gate (confirmation, matching checks and review, owner identity, authorization, refs baseline). The desk never merges. Add the local server (`desk serve`) with a loopback-only, cookie-protected API.
  Add the `@repo/desk-ui` workspace: the React desk with a board, an issue page, a React Flow graph of the pipeline, the plan and ship gates with a two-step ship dialog, a live log, and a health view, in English, German, and Serbian. Add the `desk` translation namespace. `pnpm desk serve` builds the UI first when it is missing, and `pnpm desk:ui` starts the Vite dev server with a proxy to a running desk. `@repo/desk` adds the `ship-plan` artifact id and browser-safe views of the check report and the ship plan.
  The built desk opens at a plain local URL in each browser and issues its session cookie on page load. The one-use link remains for the separate Vite development origin.
  Add optional Docker isolation (`desk start --isolation docker`, `isolation: "docker"`). One `IsolationPort` decides where the builder and the check steps run. In Docker mode they run in hardened containers with no network, a read-only root, no capabilities, and no host mount. Work moves in as a git bundle and a patch and out as a guarded patch, and dependencies come through a registry-only proxy and install offline. Add `desk docker build|login|doctor|status|prune`, `desk doctor --probe` with isolation probes, a per-issue `isolation` state field, a `docker` config block, labelled and verified cleanup in `remove` and crash recovery, and a container-only Codex sandbox flag. Real-Docker tests run with `DESK_DOCKER=1`.
  The desk board is a kanban with search, a start dialog, toasts, and compact cards that read only the issue summary (`prUrl`, `contract`, `stageEnteredAt`, `resumeStage`, `progress`, `currentNode`). Log entries carry their time in `at` only. `@repo/ui` also exports the `GitPullRequest`, `Plus`, `Search`, `SlidersHorizontal`, and `X` icons.
  The engine stops an agent run that repeats the same failing tool call 8 times and sends the issue to `needs-you`. Every agent run appends a record to `runs.jsonl` in the state root, and `desk stats` compares the runs by role, provider, and model. `GET /api/stats` serves the same numbers, the issue detail carries its `runs`, and the desk UI adds a **Runs** view and agent-usage tiles in the inspector. Token counts mean the same for Claude and Codex. A failed health check shows the command that repairs it, and the Health page can build the Docker image after a confirmation (`POST /api/health/fix`). `desk serve` reports the Docker checks too. On Windows the engine starts `pnpm` through `npm_execpath` and keeps the profile variables, so `pnpm` and the `gh` login work there. The Start dialog lists the open issues of the repository to pick from (ready label, contract count, already on the board), and the board shows the open pull requests read-only (`GET /api/github`). `desk contract` shows how intake reads an issue body, the issue templates follow the shared issue format, an issue that stops at intake keeps its title, and the UI offers Start again for it instead of a Continue that intake refuses. `desk draft` has the read-only intake agent draft a stopped issue in the issue format; the engine renders the body and keeps the old text as a quote. `desk draft --apply` writes the draft to the issue after an explicit yes, as the owner, and only when the issue did not change since the draft. The issue page offers Draft the issue format, a review dialog with the proposal and the open questions, and Apply with a second confirmation (actions `draft` and `apply-draft`, artifact `issue-draft`).
  Each run record now names the harness the agent started with (`harness: { repo, desk, head }`), and `desk stats --by-harness` splits the rows by instruction version. The desk writes review findings, failed checks, stuck runs, denials, verification violations, and broken invariants to `lessons.jsonl`, which `remove` keeps. `desk lessons` and `GET /api/lessons` list the problems seen in two or more issues, and the **Runs** view shows them as lesson candidates. The harness-eval ledger accepts calibrations and protocol 2 runs, whose conclusion must agree with the measured noise floor.

### Patch Changes

- Updated dependencies [cb7174c]
  - @repo/desk@0.1.0
  - @repo/translation@1.5.0
  - @repo/ui@1.3.1
