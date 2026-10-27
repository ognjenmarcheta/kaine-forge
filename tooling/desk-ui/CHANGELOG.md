# @repo/desk-ui

## 0.5.4

### Patch Changes

- Updated dependencies [729d942]
- Updated dependencies [1e5e82d]
- Updated dependencies [a54d7ff]
- Updated dependencies [fc6f746]
- Updated dependencies [d1fa587]
- Updated dependencies [8be54b9]
- Updated dependencies [a9cc2b2]
- Updated dependencies [5752644]
- Updated dependencies [6839bae]
- Updated dependencies [4e3873d]
- Updated dependencies [a2b6d40]
  - @repo/ui@1.9.0
  - @repo/translation@1.11.0
  - @repo/desk@0.5.1

## 0.5.3

### Patch Changes

- Updated dependencies [12ad7c5]
- Updated dependencies [2ddc1a9]
  - @repo/ui@1.8.0
  - @repo/translation@1.10.0

## 0.5.2

### Patch Changes

- Updated dependencies [6d93644]
  - @repo/ui@1.7.2

## 0.5.1

### Patch Changes

- 22dd10f: Derive a flow step's role in one contract function and send it on `FlowStepView.role`. Only a ship gate accepts a ship confirmation, so the CLI no longer suggests `ship --confirm` before an automatic ship.
- Updated dependencies [a1c0431]
- Updated dependencies [40cca08]
- Updated dependencies [ccdac99]
- Updated dependencies [40cca08]
- Updated dependencies [22dd10f]
  - @repo/ui@1.7.1
  - @repo/translation@1.9.1
  - @repo/desk@0.5.1

## 0.5.0

### Minor Changes

- 500e8a7: Make the agent desk's flows and agents configurable data: issues run on a frozen flow snapshot through one interpreter, agents resolve presets against a policy floor and record a capability receipt per run, and definitions save locally and promote to `.desk/`. The desk UI adds the Flows and Agents pages, a flow picker on Start, the issue's flow in its header and stages, and capability receipts in the stage side sheet, with new `desk` translation keys.
- 500e8a7: Add `pnpm doc:export`, which exports a small Markdown subset to Word (`.docx`) and PowerPoint (`.pptx`) files with the same bytes for the same input, and verifies exported files with `--verify`. The tool keeps its input and output inside the repository and outside dot-directories, `node_modules`, and the desk's protected paths. Agent Desk agents gain opt-in extra tools (`capabilities.tools`, catalog `doc-export`) for the edit-code preset: the resolver allows exactly `pnpm doc:export`, the capability profile and run receipt list `extraTools`, and the Agents page adds an Extra tools field with new `desk` translation keys.

### Patch Changes

- Updated dependencies [527509e]
- Updated dependencies [500e8a7]
- Updated dependencies [500e8a7]
- Updated dependencies [b7011e2]
  - @repo/ui@1.7.0
  - @repo/desk@0.5.0
  - @repo/translation@1.9.0

## 0.4.0

### Minor Changes

- 4f69756: Redesign the agent desk around the owner's turn. The board opens on Your turn with quick and batch approve for low-risk plans, the issue page has a short header, decision gates with plan risk and file review, a trace of every step, and a stage side sheet, and the shell adds a command palette, shortcuts, an 8-second undo window, and opt-in notifications. Health shows setup progress, Runs adds today's summary, seven-day cards, and cost by role, and lessons can be promoted, unpromoted, or turned into a GitHub issue after the owner confirms the exact text. The engine records plan risk, pause and resume, approve notes, and a seven-day series, and the design system adds the tokens the desk uses.

### Patch Changes

- Updated dependencies [4f69756]
  - @repo/desk@0.4.0
  - @repo/translation@1.8.0
  - @repo/ui@1.6.0

## 0.3.0

### Minor Changes

- 3408a45: Adopt the Byteforge brand as the default light and dark themes. The palette uses one orange for actions, selection, links, and focus, on cool white and ink-black neutrals, with matching success, information, warning, and danger roles and a darker amber severe role. Text on orange fills uses the new `--ds-text-brand-inverse` token so it meets WCAG AA, and a contrast contract test checks the key pairs in both themes. Web, desktop, and mobile use Geist and Geist Mono, self-hosted. Shapes follow the site: pill buttons, 8px inputs, 12px menus, and 20px cards and dialogs. Shadows are ink-tinted, the easing is a quick ease-out, and buttons scale to `--ds-motion-press-scale` (0.97) on press. This replaces `--ds-motion-distance-press`, and `@repo/mobile-ui` exports `motionPressScale` and `fontFamilies` and drops `motionDistances.press`. A new mark, an olive tree growing through the Byteforge anvil, replaces the app icons, favicon, and README logo, and its Blender source and render script are in `media/brand/`.

### Patch Changes

- Updated dependencies [3408a45]
- Updated dependencies [040fc60]
  - @repo/ui@1.5.0
  - @repo/desk@0.3.2
  - @repo/translation@1.7.0

## 0.2.2

### Patch Changes

- Updated dependencies [5d411b1]
  - @repo/desk@0.3.1

## 0.2.1

### Patch Changes

- Updated dependencies [6a30ea3]
  - @repo/desk@0.3.0
  - @repo/translation@1.7.0

## 0.2.0

### Minor Changes

- 5786f03: Intake drafts grade the issue's fit for an agent run: clarity, complexity, and verifiability from 1 to 3, with the lowest grade as the confidence. `desk draft` and the draft dialog show the grades, and `desk start` warns, without blocking, when the scored body has confidence 1.
- 078f259: Send PR feedback back to the builder after ship. At `pr-open`, `pnpm desk feedback <n> --from-pr [text]` (and the `pr-feedback` action, **Send PR feedback** in the UI) reads the failing checks with their log tail and the reviews and comments of trusted accounts on the PR head, redacts, cuts, and fences that text, adds the owner's optional note, and runs build, check, and review again. It refuses with `pr-refused` and changes nothing unless the PR is open, its head is the clean worktree HEAD, and there is something to send. The ship of such a round updates the open PR: no rebase, a plain push to the same branch, no new PR, and a fresh read of the PR right before the push.
- 078f259: Add a `pr-open` stage after `ship`. The desk waits there while the owner reviews and merges the draft PR on GitHub. `pnpm desk refresh <n>` (and the `refresh-pr` action, **Check the PR** in the UI) reads the PR once: merged ends the issue at `shipped`, closed ends it at `cancelled`, open changes nothing. The desk does not poll, and it never merges, approves, marks a PR ready, enables auto-merge, or force-pushes. The issue state counts PR feedback rounds against the new `maxPrRounds` config (default 3).

### Patch Changes

- Updated dependencies [5786f03]
- Updated dependencies [078f259]
- Updated dependencies [078f259]
  - @repo/desk@0.2.0
  - @repo/translation@1.6.0

## 0.1.3

### Patch Changes

- Updated dependencies [e047bf0]
  - @repo/ui@1.4.0

## 0.1.2

### Patch Changes

- Updated dependencies [cdbf45d]
  - @repo/desk@0.1.2

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
