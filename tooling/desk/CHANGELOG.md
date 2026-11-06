# @repo/desk

## 0.6.0

### Minor Changes

- d1325ed: The issue header shows the active time of a finished issue beside the total. The active time
  leaves out the waits at a gate, the open pull request, and a stop in `needs-you`, so a PR that
  sat on GitHub for hours no longer counts as work.
- 1a3fc0f: Every agent now has an avatar, an icon on a theme tone, which the agent file sets with an optional `avatar` field and the agent editor picks; an agent without one gets a stable default from its id, and the avatar is not part of the definition or snapshot hash.
- cef5a53: The agent desk adds two lab jobs (ADR 0021). Build component plans a new @repo/ui component, waits
  for your approval of the plan, then builds it with its test and a lab specimen, and opens a draft
  PR with its changeset. Audit screen checks a lab screen against the UI guidelines, WCAG 2.2, and
  its reference image, and files only the findings you tick. The lab gains a Specimens page.
- cd5c89e: The agent desk keeps watching a promoted lesson. `pnpm desk lessons` and the **Promoted lessons**
  list show the times and the issues a promoted lesson's problem came back after the promotion, so an
  encoding that did not cover the problem can be revised or removed. The lessons report gives each
  promoted lesson a `recurrence` field.
- a4943a9: The agent desk can run OpenCode 2.2.4+ as the provider of any role, on the host and in Docker
  (issue #484). A run uses `opencode run --standalone --format json` with only the desk's rules:
  every action is denied first, then the role's allow rules, then its deny rules. `desk doctor`
  checks the OpenCode version, flags, and model when a role uses it. The desk UI labels the
  provider "OpenCode".
- cc50650: The agent desk can fix a PR until merge. The Board's Open pull requests list shows each PR's CI and
  review state. A desk PR offers Check CI and comments, which reads what a fix round would read and
  keeps a summary, and Address feedback, which runs the PR feedback round. A fresh list notices a
  merged desk PR and moves its issue to done with the merge date, which the Done list shows and sorts
  by. A new PR carries its issue's `source:*` labels, and the desk trusts the usual review bots
  (CodeRabbit, GitHub Actions, Copilot) by default.
- b1b7350: The agent desk no longer stops when a provider CLI is missing. Before each run it checks which of Claude Code, Codex, and OpenCode run, keeps the provider the role asks for when it can, and otherwise moves the run to the best other one with a note in the history. Desk jobs follow the same rule. A new config opt-in, `allowCodexBuilder`, lets Codex change code, and Setup offers it as a fix. A step that no CLI can run stops with the new code `no-provider`, and the step rail names the provider that ran.
- a554319: A report step can go anywhere in a flow. A gate after the plan stays the plan approval when
  report steps sit between them, and the validator applies the same rule. Every agent step now
  reads the reports of earlier report steps as fenced advice, and a rerun after feedback also reads
  the reports on its earlier output. The plan gate shows the reports on the plan.
- 5c0f6b4: A desk stop that comes from a command the desk refused to an agent now has two buttons on the issue card: "Allow this command and retry" and "Skip it and continue". Allow keeps the exact command for that issue only, as one exact allow rule, and the desk never offers a command that its deny rules refuse. Skip tells the agent to leave the command out. The new `resolve-denial` action and the `deniedCommands` field of the issue detail carry it.
- 69d84bb: The desk ships eight read-only specialist agents (product strategist, designer, motion designer, DX advocate, architect, security officer, tech writer, simplifier) that any flow can use, and denies every repository skill an agent does not list.
- 4c41c94: The agent desk runs the monorepo scorecard as a desk job (ADR 0021). Run scorecard on the
  Scorecard view starts it: the engine runs the checks and the GitHub reads, one Claude run scores
  with kaine-explorer subagents under a dollar budget and a time limit, and the engine writes the
  ledger. At the job's gate you preview the new scores and tick the issues to file; approve files
  them and opens a draft PR with the ledger. Desk agent runs can now carry a budget
  (`--max-budget-usd`), and issue-less branches are named `KAINE-<type>-<slug>`.
- cc50650: The Scorecard view tracks scorecard work end to end. Scorecard and audit jobs label the issues they
  file `source:scorecard` and `source:audit`, the ledger PR gets `source:scorecard`, and ship writes
  each filed issue's number on its finding. The view reads the scorecard's issues live from GitHub
  and shows Recently solved (with the dimension's score change), each finding's issue, PR, and desk
  run, Fix with desk, findings sorts, and a confirmed backfill of the label on older issues.
- 87b8219: The agent desk has a Scorecard view. `GET /api/scorecard` reads the monorepo health ledger of the
  checkout through one contract, and the view shows the selected run's scores and their change, the
  overall trend, each dimension's reasons, the open findings, and the diagrams. The desk preferences
  also choose the theme (Byte Forge or Moss). `pnpm scorecard` no longer writes `scorecard-out/`.
- 2271b43: The agent desk recreates a reference image as a lab screen in a desk job (ADR 0021). Recreate
  screen in the Lab view uploads the image; the job builds the screen in its own worktree and lab
  server with the Playwright browser, may write only its screen folder, and passes the lab checks
  and `lab:diff`. At the gate you open the live compare view, then approve to push the folder as a
  draft PR.
- e4a6c42: The agent desk adds the specialist job (ADR 0021). Run a specialist in New work, or Run on a report
  agent in Agents, runs one report agent from the agent library, such as a built-in specialist,
  against a repository path, a GitHub issue, or your brief, without an issue run. The agent reads and
  reports; you read the report at the gate and close the job. Nothing is pushed or filed.
- 27abb62: The agent desk lets the owner reach a running agent (ADR 0022). Steer sends a note: the agent
  stops and goes on in the same session with it, or starts again with it when it had no session
  yet. Take over stops a plan or change agent so the
  owner works in its session; continue or feedback hands it back. Both are on the running issue's
  card and in the HTTP API.
- bdbfa41: A `needs-you` history event records why the issue stopped as `code` (`loop-limit`,
  `same-failure`, `blocked`, `error`, `pr-round-limit`, `intake`, or `interrupted`), and
  `IssueSummary` exposes it as `needsYouCode`. A send-back's history note keeps the owner's words
  (`to plan: …`), so a later round can show what was asked.
- 87b8219: The UI lab is now the agent desk's Lab view (`?view=lab`, G then L), and `@repo/ui-lab` is gone.
  `pnpm lab` starts the desk UI dev server; the lab opens without a desk server. `lab-frame.html`
  shows the lab alone for the compare view and `lab:shots`/`lab:diff`, and it is the one desk page
  that the desk itself may frame. Lab themes load as a constructed stylesheet under the desk CSP.

### Patch Changes

- d947f31: An issue whose change edits the `.ai/` sources can now ship. After such a build, the engine runs the worktree's `ai:install` command, which no agent may run, so the tracked copies (`AGENTS.md`, `CLAUDE.md`, `REVIEW.md`, and Serena memories with a source) follow their sources. The plan-scope and protected-path rules, and the ship gate, accept those copies; the `pre-push` hook still refuses one that differs from the generator's output.
- 91e33eb: "Allow this command and retry" now tells the agent that the command is allowed. Before, it only restarted the stage, and a resumed agent that remembered the refusals did not try the command again (issue 864 stopped a second time without a Bash call). Allow and skip both send the stage feedback now.
- 40b44ce: A desk job's ship step wraps the commit body at commitlint's 100 characters, so a long summary from
  the agent no longer fails the commit. Issue labels are kept to the labels in
  `.github/repo-setup.json`: the job prompts list them, and the desk drops and names an unknown one. A PR label is added through the REST API, because `gh pr edit` fails on gh versions that still read
  GitHub's retired classic project cards.
- d9eecbc: A desk job page now updates while the job runs. The server sent `job-updated` and `job-removed`
  events, but the browser did not listen for them, so a job page stayed on its first state until a
  reload.
- d2ade33: The scorecard review gate now reads top to bottom: the score tiles and the plain-language result,
  the dimensions that moved, each open question in its own numbered block, the proposed issues as
  cards with label tags, and the decision. The technical summary and evidence are folded. The other
  job gates use the same question blocks and issue cards. The scorer prompt asks for a summary of
  at most three sentences.

## 0.5.2

### Patch Changes

- 54c80df: Remove the unread `PIPELINE` constant and its `PipelineDefinition`, `PipelineNode`, `PipelineEdge`, `PipelineLoopEdge`, `HumanGate`, and `ActiveStage` types from `@repo/desk/contracts`. The flow model takes its nodes and edges from the flow snapshot.

## 0.5.1

### Patch Changes

- 40cca08: Derive an agent step's run input (permission role, read-only rule, resumed session, pending feedback) in the agent module, so the plan, build, review, and report handlers keep only their schema, artifact, and event.
- ccdac99: Run every desk git command through the git module, with one git environment (no prompt, no optional locks, no editor) and one branch-name rule. Worktree setup now creates the worktree through `GitPort`.
- 40cca08: The ship module owns ship admission: `shipAdmission(state, intent)`, a side-effect-free `prepareShip`, and `runShip(ticket)`. A ship refused at its gate changes nothing, and an admitted ship enters the ship stage before its first change.
- 22dd10f: Derive a flow step's role in one contract function and send it on `FlowStepView.role`. Only a ship gate accepts a ship confirmation, so the CLI no longer suggests `ship --confirm` before an automatic ship.

## 0.5.0

### Minor Changes

- 500e8a7: Make the agent desk's flows and agents configurable data: issues run on a frozen flow snapshot through one interpreter, agents resolve presets against a policy floor and record a capability receipt per run, and definitions save locally and promote to `.desk/`. The desk UI adds the Flows and Agents pages, a flow picker on Start, the issue's flow in its header and stages, and capability receipts in the stage side sheet, with new `desk` translation keys.
- 500e8a7: Add `pnpm doc:export`, which exports a small Markdown subset to Word (`.docx`) and PowerPoint (`.pptx`) files with the same bytes for the same input, and verifies exported files with `--verify`. The tool keeps its input and output inside the repository and outside dot-directories, `node_modules`, and the desk's protected paths. Agent Desk agents gain opt-in extra tools (`capabilities.tools`, catalog `doc-export`) for the edit-code preset: the resolver allows exactly `pnpm doc:export`, the capability profile and run receipt list `extraTools`, and the Agents page adds an Extra tools field with new `desk` translation keys.

## 0.4.0

### Minor Changes

- 4f69756: Redesign the agent desk around the owner's turn. The board opens on Your turn with quick and batch approve for low-risk plans, the issue page has a short header, decision gates with plan risk and file review, a trace of every step, and a stage side sheet, and the shell adds a command palette, shortcuts, an 8-second undo window, and opt-in notifications. Health shows setup progress, Runs adds today's summary, seven-day cards, and cost by role, and lessons can be promoted, unpromoted, or turned into a GitHub issue after the owner confirms the exact text. The engine records plan risk, pause and resume, approve notes, and a seven-day series, and the design system adds the tokens the desk uses.

## 0.3.2

### Patch Changes

- 040fc60: Issue worktrees get the Context7 MCP server next to Serena, and every desk role may use its two read tools, so the planner and the reviewer can look up library docs on the host. The Docker builder stays offline. The builder may run one test file with `pnpm --filter <workspace> exec vitest run <path>`, and the reviewer reads the engine's `check-report.json` instead of running checks. Review starts only when that report passed for the current diff; otherwise the issue stops with the command to run the checks again.

## 0.3.1

### Patch Changes

- 5d411b1: Add a separate `revision` field to the planner output contract so a revised plan keeps `summary` as the description of the whole change. The field is a required, nullable string (`nonEmpty.nullable().default(null)`).

## 0.3.0

### Minor Changes

- 6a30ea3: Make the desk run end to end on a Windows host. The default isolation there is `docker`, issue worktrees go next to the main checkout, the Codex runner uses the unelevated Windows sandbox, and the Claude prompt goes on stdin instead of the command line. Docker check containers get CI's loopback `DATABASE_URL` placeholder, and the worker image has `ps`. The builder may run `pnpm turbo run <script> --filter=<workspace>`, which builds what the tests import. `desk doctor` adds rows for agent labels, workspace builds, the Windows Codex sandbox, and worktree path length, with UI fixes for labels and builds. A branch that a background sync fast-forwards to its remote no longer breaks the refs invariant, and `serve` says when another desk holds its port. `feedback --from-pr` can read review bots that the owner lists in the new `reviewBots` config (for example `coderabbitai[bot]`), names every author it left out for trust, and folds bot markup before it cuts a comment. A Claude session that cannot be resumed (another Claude store) restarts fresh.

## 0.2.0

### Minor Changes

- 5786f03: Intake drafts grade the issue's fit for an agent run: clarity, complexity, and verifiability from 1 to 3, with the lowest grade as the confidence. `desk draft` and the draft dialog show the grades, and `desk start` warns, without blocking, when the scored body has confidence 1.
- 078f259: Send PR feedback back to the builder after ship. At `pr-open`, `pnpm desk feedback <n> --from-pr [text]` (and the `pr-feedback` action, **Send PR feedback** in the UI) reads the failing checks with their log tail and the reviews and comments of trusted accounts on the PR head, redacts, cuts, and fences that text, adds the owner's optional note, and runs build, check, and review again. It refuses with `pr-refused` and changes nothing unless the PR is open, its head is the clean worktree HEAD, and there is something to send. The ship of such a round updates the open PR: no rebase, a plain push to the same branch, no new PR, and a fresh read of the PR right before the push.
- 078f259: Add a `pr-open` stage after `ship`. The desk waits there while the owner reviews and merges the draft PR on GitHub. `pnpm desk refresh <n>` (and the `refresh-pr` action, **Check the PR** in the UI) reads the PR once: merged ends the issue at `shipped`, closed ends it at `cancelled`, open changes nothing. The desk does not poll, and it never merges, approves, marks a PR ready, enables auto-merge, or force-pushes. The issue state counts PR feedback rounds against the new `maxPrRounds` config (default 3).

## 0.1.2

### Patch Changes

- cdbf45d: Desk worktrees install Serena v2 with the classic tools interface, and the desk denies and flags the `serena_repl` tool.

## 0.1.1

### Patch Changes

- cfa361b: Docker isolation works on a Windows host: the container policy accepts the absolute Windows path of
  the staging folder and still refuses a drive root, the Docker pipe, and network shares. In Docker
  mode the ship checks run in containers, through the same isolation port as the loop checks, so a
  Windows host runs every check on Linux. On a host where git ignores the exec bit on disk, the
  container patch's exec bits go into the index, and ship keeps index exec bits through its reset
  and add, so the commit keeps them.

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
