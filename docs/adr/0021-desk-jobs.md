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

### Trust boundary

- **The agent never holds a GitHub token.** The engine runs every `gh` read and every GitHub write. The scorer's deny list keeps the whole desk policy floor (`gh`, installs, servers, WebFetch, protected paths, skills outside its list).
- **Subagents are allowed and bounded.** A job allows the `Agent` tool (and its old name `Task`). Under `--permission-mode dontAsk`, a subagent inherits the session's allow and deny rules: on claude 2.1.309 a subagent's `Bash` call outside the allowlist was denied. So a subagent can do no more than the job itself.
- **Each job kind has its own command allowlist.** The scorecard job allows none: it only reads.
- **Writes wait for the owner.** Nothing is pushed or filed before the gate's approve, which the API accepts only with `confirm: true`.

### Limits

Each job has a cost cap and a time cap, with defaults per kind (scorecard: $15 and 60 minutes; screen: $10 and 60 minutes) that the owner may change at start. The cost cap is Claude's own `--max-budget-usd`, which counts subagents and ends the run with `error_max_budget_usd`; the job then stops as `needs-you` with the reason `budget`. The time cap is the run's timeout.

## Consequences

- The desk can run a scorecard end to end, with the owner deciding what is saved and filed.
- Jobs reuse the runner, the worktree bootstrap, the GitHub port, the ship helpers, and the live event stream; they do not reuse the issue pipeline's state machine, which is issue-bound.
- Job worktrees sit beside issue worktrees as `KAINE-job-<n>` and stay until the owner removes the job.
- The Board's "Your turn" count and the tab title count issues only; jobs show in their own card on the Board.
- Later job kinds (component, audit) add their flow, skills, command allowlist, and limits, and reuse the screen job's lab server and browser.

## Alternatives considered

- **Flows on an issue.** One model, but every scorecard run and screen would create a GitHub issue, and the issue pipeline's plan and build stages do not fit a scoring run.
- **Give the agent `gh`.** Matches a Claude Code session most closely, but puts a token in the agent's reach for reads the engine can do itself.
- **A dollar cap from token counts.** The stream reports tokens per turn, not cost; Claude's own budget flag is exact and covers subagents.
