# ADR 0021: Desk jobs

- Status: Accepted
- Date: 2026-11-02

## Context

The agent desk (ADR 0011) drives one GitHub issue through intake, plan, build, check, and review to a draft PR. The owner also wants to start other work from the desk and get the quality of a Claude Code session: first a monorepo scorecard run (the `kaine-scorecard` skill), later UI lab work (recreate a screen, build a component, audit a screen).

That work does not fit an issue run:

- It has no GitHub issue, and creating one per run would fill the tracker with bookkeeping.
- A Claude Code session fans out subagents (five `kaine-explorer` probes for the scorecard), reads GitHub with `gh`, and runs repo commands. A desk agent runs one locked-down `claude -p` call with no subagents, no `gh`, no tokens, and an allowlist of check commands.
- A scorecard run ends with GitHub writes (filing issues) that the owner approves one by one.
- It spends real money: the desk recorded agent cost but never capped it.

The name is "job". `CONTEXT.md` lists "task" as a term to avoid next to Todo. "Job" in the desk means an owner-started desk run; it is unrelated to the API's background jobs (ADR 0018).

## Decision

A **desk job** is a new run kind beside issue runs. The owner starts it from the desk. It has its own worktree and branch, runs one fixed flow per kind, and stops at a gate before anything leaves the machine.

- **Storage.** `<state>/jobs/job-<n>.json` and a folder per job. Only the desk server runs jobs, so a job has one writer and no lease. After a restart, a job that was running becomes `needs-you` (interrupted).
- **Worktree and branch.** From `origin/<baseBranch>`, with the same bootstrap as an issue worktree (install, AI files for exactly the job's skills, doctor), named `KAINE-<type>-<slug>` because there is no issue (AGENTS.md).
- **One job of a kind at a time.** A second scorecard job is refused until the first ends.
- **The scorecard flow.** Setup → sweep → score → review gate → ship.
  - The **sweep** is engine-side: `pnpm boundaries`, `knip`, `audit`, `ai:doctor --strict`, and the `gh` reads of CI runs, code scanning, Dependabot, rulesets, issues, open PRs, and the latest CI coverage totals, written to the worktree's `.ai.local/desk-job/sweep.json`.
  - The **scorer** is one Claude run that follows `kaine-scorecard` and fans out `kaine-explorer` subagents. It returns the run, its calibration bullets, and proposed issues as structured output. It edits nothing.
  - The **engine** writes the ledger: it sets the date, commit, mode, agent, and overall itself (the facts it can prove), appends the run and the notes, and runs `pnpm scorecard` and Prettier.
  - At the **gate**, the owner sees the preview (the Scorecard view on the job's worktree), the open questions, and the proposed issues, and ticks the issues to file. Approve files exactly those issues through the desk's GitHub port, then commits, pushes, and opens a draft PR labelled `release:skip-changeset`. Send back reruns the scorer with the owner's note.

### The screen job

Added with the second job kind. Flow: setup → build → check → review gate → ship.

- **Start.** **Recreate screen** in the Lab view takes the screen id (`10-medspa`), title, frame size, mode, and the reference image. The desk takes the image as base64 in the start request, checks its first bytes against the claimed type (PNG, JPEG, or WebP) and its size (10 MB), and writes it to the worktree's `tooling/desk-ui/public/references/` (gitignored).
- **Lab server.** The engine starts the desk UI's Vite server from the job worktree on a free loopback port and gives the agent `LAB_URL`. It is the one long-running process the desk owns: one per screen job, kept while the job waits at its gate (so the gate can link to the compare view), and stopped at ship, cancel, remove, or desk shutdown. A desk restart starts it again for a job at its gate.
- **Build.** One Claude run follows `kaine-build-ui` in reference-image mode with the Playwright MCP browser, and may start subagents (for example a `kaine-audit-ui` pass). It may write only its screen folder (`Edit(tooling/desk-ui/src/lab/screens/<id>/**)`, which also covers `Write`) and run `lab:diff`, `lab:shots`, the desk UI test, lint, and typecheck, and `ui:check`.
- **Check.** The engine runs the lab tests, eslint on the folder, the desk UI typecheck, and `ui:check`. A failure stops the job and hands the output to the builder on **Continue**. Then the engine runs `lab:diff --json` for the gate.
- **Gate and ship.** The owner opens the compare view, reads the diff percent and the deviations, and approves or sends back. Approve commits only the screen folder, pushes, opens a draft PR labelled `release:skip-changeset`, and stops the lab server. The reference image never leaves the machine.

### The component job

Added with the third job kind. Flow: setup → plan → plan gate → build → check → review gate → ship.

- **Start.** **Build component** in the Lab view takes the export name (`RatingStars`), the layer (`primitives` or `composed`), and what the component is for. The desk refuses a name that `@repo/ui` already has.
- **Plan.** One Claude run follows `kaine-build-ui` and returns the props and variants, what the component builds on, and what its tests prove. It writes nothing. At the **plan gate** the owner approves the plan or sends it back; approve starts the build and needs no second confirmation, because nothing leaves the machine.
- **Build.** One Claude run builds the approved plan with `kaine-build-ui` and `kaine-test`, in the job's lab server with the Playwright browser. It may write exactly five paths: the component, its test, `packages/ui/src/index.ts`, its lab specimen (`tooling/desk-ui/src/lab/specimens/<file>.specimen.tsx`, which the lab finds by file name), and `DESIGN_SYSTEM.md`. It runs only the `@repo/ui` test, lint, and typecheck, the desk UI typecheck, `ui:check`, and `theme:check`.
- **Check.** The engine checks that the component, its test, and its specimen exist, then runs the component's test, eslint on its files, both typechecks, and `ui:check`. A failure goes back to the builder on **Continue**.
- **Gate and ship.** The owner opens the specimen in the job's lab server, reads the differences from the plan, and approves or sends back. Approve writes the changeset (`"@repo/ui": minor`), commits only the job's paths, pushes, opens a draft PR (without `release:skip-changeset`, because a package changes), and stops the lab server.

### The audit job

Added with the fourth job kind. Flow: setup → audit → gate → file.

- **Start.** **Audit screen** in the Lab view takes the id of a lab screen that the checkout has.
- **Audit.** The engine copies the owner's local reference image of that screen, when there is one, into the worktree and starts the lab server. One Claude run follows `kaine-audit-ui` (in reference mode when the image is there) and `kaine-write-issue`, with the Playwright browser. It writes nothing and runs only `lab:diff`, `lab:shots`, and `ui:check`. It returns each finding with its rule ID and severity, as the issue to file.
- **Gate.** The owner opens the screen (its compare view in reference mode), ticks the findings to file, and approves (with a confirmation) or sends back. Approve files exactly the ticked findings through the desk's GitHub port and stops the lab server. An audit pushes nothing: its local branch goes when the owner removes the job.

### The role job

Added with the fifth job kind. Flow: setup → report → gate. One generic kind runs any registered report agent, so a new role agent needs a file in the agent library and no new job kind.

- **Start.** **Run a role** in New work, or **Run** on an agent in the Agents library, takes an agent id and a target: a repository path, a GitHub issue number, or the owner's brief. The agent must resolve in the registry (built-in, repository, or local) with `output: report` and the `read-only` or `run-checks` preset; the desk refuses any other agent at start. It snapshots the agent's name, prompt, skills, and MCP servers into the job, so a send-back runs the same agent. The job runs on the job's provider and model, as every job does; the agent file's provider and model do not apply. One role job runs per agent at a time.
- **Report.** No lab server. The engine builds the prompt from the agent's own body, its skill instruction, and a fenced Target section: the path to read, the issue's title and body (read by the engine through the GitHub port and fenced as untrusted), or the brief. One run returns the `report` output (summary, findings, plain language). It writes nothing.
- **Permissions.** The read-only floor with the agent's skills and MCP servers in place of a kind's list. A `run-checks` agent gets no command: a role job has no workspace to check.
- **Gate.** The owner reads the report. Approve closes the job: nothing is pushed, nothing is filed, and no confirmation is asked, because nothing leaves the machine. Send back runs the agent again with the owner's note. The local branch goes when the owner removes the job.

### Trust boundary

- **The agent never holds a GitHub token.** The engine runs every `gh` read and every GitHub write. The scorer's deny list keeps the whole desk policy floor (`gh`, installs, servers, WebFetch, protected paths, skills outside its list).
- **Subagents are allowed and bounded.** A job allows the `Agent` tool (and its old name `Task`). Under `--permission-mode dontAsk`, a subagent inherits the session's allow and deny rules: on claude 2.1.309 a subagent's `Bash` call outside the allowlist was denied. So a subagent can do no more than the job itself.
- **Each job kind has its own command allowlist.** The scorecard job allows none: it only reads.
- **Writes wait for the owner.** Nothing is pushed or filed before the gate's approve, which the API accepts only with `confirm: true`.

### Limits

Each job has a cost cap and a time cap, with defaults per kind (scorecard: $15 and 60 minutes; screen and component: $10 and 60 minutes; audit and role: $5 and 30 minutes) that the owner may change at start. The cost cap is Claude's own `--max-budget-usd`, which counts subagents and ends the run with `error_max_budget_usd`; the job then stops as `needs-you` with the reason `budget`. The time cap is the run's timeout.

### Tracking

Added so the owner can score, report, fix, and track scorecard work in the desk.

- **Source labels.** The scorecard and audit jobs add `source:scorecard` and `source:audit` to the issues they file, creating the label with `--force` first. The ledger PR gets `source:scorecard`. An issue run's new PR gets its issue's `source:*` labels, so the fix carries its origin too.
- **Write-back.** Ship writes each filed issue's number on its finding in the run the job appended, re-renders, and commits. The ledger then links finding to issue without a lookup by title.
- **Live tracking.** The desk stores nothing about GitHub's state. `GET /api/scorecard/tracking` reads the issues the ledger names, the issues the scorecard jobs filed, and the issues labelled `source:scorecard` in one GraphQL call (once per issue when GitHub refuses the whole call), with each issue's closing PRs and its desk run, cached 60 s. An issue counts as solved when it is closed and a merged PR closed it; the merge date is the solved date.
- **Backfill.** `POST /api/scorecard/backfill` adds `source:scorecard` to tracked issues without it, only with `confirm: true` and only for issues the tracking lists without the label.
- **Storage.** No database: GitHub and the ledger are the source of truth, and the desk's own state stays in files. Issue #852 names the triggers and the two upgrade paths (SQLite through `node:sqlite`, or an opt-in deployed store).

## Consequences

- The desk can run a scorecard end to end, with the owner deciding what is saved and filed.
- Jobs reuse the runner, the worktree bootstrap, the GitHub port, the ship helpers, and the live event stream; they do not reuse the issue pipeline's state machine, which is issue-bound.
- Job worktrees sit beside issue worktrees as `KAINE-job-<n>` and stay until the owner removes the job.
- The Board's "Your turn" count and the tab title count issues only; jobs show in their own card on the Board.
- The lab jobs (screen, component, audit) share the lab server and the browser; each kind has its own flow, skills, command allowlist, write paths, and limits.
- The role job is the one kind whose agent is data: its prompt, skills, and MCP servers come from an agent file, and the engine adds only the target and the read-only floor.

## Alternatives considered

- **Flows on an issue.** One model, but every scorecard run and screen would create a GitHub issue, and the issue pipeline's plan and build stages do not fit a scoring run.
- **Give the agent `gh`.** Matches a Claude Code session most closely, but puts a token in the agent's reach for reads the engine can do itself.
- **A dollar cap from token counts.** The stream reports tokens per turn, not cost; Claude's own budget flag is exact and covers subagents.
