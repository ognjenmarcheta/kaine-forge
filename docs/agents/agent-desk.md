# Agent desk

The agent desk drives a GitHub issue through intake, plan, build, check, and review
to a draft PR. The owner approves at two gates and merges every PR. See
[ADR 0011](../adr/0011-local-agent-desk.md).

## Commands

Run `pnpm desk <command>` from the repository root. A command that drives an issue runs
until the issue reaches a human gate, `needs-you`, or the end. Then it exits. A stage can
take many minutes, so the command prints live progress (see "Live output").

### Drive an issue

| Command                                                                                  | What it does                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start <n> [--override] [--no-writeback] [--snapshot-file P] [--isolation host\|docker]` | Run intake, setup, and plan to the plan gate. Run it again to retry intake after you fix the issue. `--isolation docker` runs the builder and the checks in containers. |
| `approve <n>`                                                                            | At the plan gate: approve the plan. Build, check, and review run to `pr-review`.                                                                                        |
| `feedback <n> --to TARGET TEXT...`                                                       | Send feedback to `plan`, `build`, or `review`, then run on. `--file P` reads the text from a file.                                                                      |
| `continue <n> [--from STAGE]`                                                            | From `needs-you`: retry the recorded stage (or STAGE), then run on.                                                                                                     |
| `cancel <n>`                                                                             | End the issue. The worktree stays.                                                                                                                                      |
| `remove <n> [--force] [--keep-worktree]`                                                 | Delete the desk state and the worktree. It refuses a dirty worktree unless `--force`. The branch stays.                                                                 |
| `ship <n> [--confirm \| --dry-run]`                                                      | At `pr-review`: commit, push, and open a draft PR. See "Ship". The desk never merges.                                                                                   |

- Every driving command also takes `--json` and `--no-writeback`.
- `--no-writeback` writes no label and no comment to GitHub. The issue remembers it
  (a `no-writeback` file in its state folder), so `approve` and later calls stay quiet.
  `--snapshot-file` turns it on too.
- `--snapshot-file P` reads the issue from a JSON file and needs `--override`. See
  "Try it without GitHub".
- Put `--` before feedback text that starts with `-`: `feedback 12 --to build -- --verbose is noisy`.
- The command prints where the issue stopped, what is next, and the exact command to run:

```text
#12: waiting for you (stage plan-gate, waiting)
Plan ready: Add a CSV export for reports
No open questions.
Next:
  approve with: pnpm desk approve 12
  or send feedback: pnpm desk feedback 12 --to plan "<text>"
```

At `needs-you` it prints the reason and `continue with: pnpm desk continue 12 (retries 'build')`.
A terminal bell rings at a gate and at `needs-you` (not with `--json`).

### Look at an issue

- `status [n] [--json]`: one issue (stage, branch, worktree, authorization, `needs-you`
  reason, next step, last history), or one line per issue. It only reads. For a number
  with no state, or unreadable state, it exits 1.
- `logs <n> [--follow] [--json]`: the persistent agent log (see "Logs"). `--follow` keeps
  reading until Ctrl-C. `--json` prints the raw records, one per line.
- `resume <n>`: print the command that opens an agent session by hand, for example
  `cd <worktree> && claude --resume <session id>`. It lists the builder first, then the
  planner, with `codex resume <id>` for a Codex role. It refuses when the issue has no
  worktree, the worktree is gone, or no agent has run yet. Stop every desk run for the
  issue first, and close your session before the next desk command.

### Repository commands

- `labels sync [--apply]`: print the `gh label create` commands. `--apply` runs them.
- `doctor [--json] [--probe]`: check the environment. It only reads. It also checks Docker (see
  "Docker isolation"). `--probe` runs the isolation probes in a throwaway container.
- `docker build|login|doctor|status|prune`: Docker isolation commands (see "Docker isolation").
- `serve [--port N] [--no-open]`: start the local server (see "Serve"). It prints a one-use
  launch link and runs until Ctrl-C. Then it closes the server and exits 0.
- `--help`: list the commands.

### Exit codes

| Code | Meaning                                                                        |
| ---- | ------------------------------------------------------------------------------ |
| 0    | The issue stopped at a human gate, or it is done (`shipped`, `cancelled`).     |
| 1    | The issue needs you, the call was refused, or the command failed.              |
| 2    | Usage error: a bad flag, a missing number, a bad stage, or an unknown command. |

A refusal prints `#12: refused (invalid-transition). <reason>` on stderr and changes nothing.
The refusals are `leased`, `unknown-issue`, `unreadable`, `invalid-transition`,
`ship-refused`, `already-started`, `intake-refused`, `authorization`, `worktree-dirty`,
and `remove-failed`.

### Live output

While a command drives an issue, stage changes print on stdout (`09:41:02 build: stage-started`).
Compact agent activity prints on stderr: tool names and files, skill calls, denials, and
errors (`09:41:07 [builder] Skill kaine-test`). Agent prose and command output go to the log
only. With `--json`, the command prints one JSON result on stdout and nothing else.

### Interrupted runs

Ctrl-C (or a crash) during a stage leaves the issue `running`. Every driving command first
runs recovery: each `running` or `queued` issue becomes `needs-you` with a note, and a
leftover agent process group is stopped. Then run `pnpm desk continue <n>`. Recovery never
resumes by itself, and it skips an issue that a live desk process drives.

## Logs

Each issue has `agent.log.jsonl` in its state folder. The driving commands append one JSON
record per line: `history` (stage events), `agent` (session, text, tool calls, results,
denials, errors), and `log` (desk messages). `desk logs` and the future UI read this file.

- Every text field passes `redact()` before it is written: bearer tokens, `sk-` keys,
  GitHub tokens, JWTs, `token=`/`password=` pairs, and URL credentials. It also cuts each
  field at 4000 characters. `redact()` is a copy of the one in `.ai/factory-progress.ts`.
  It catches known shapes. It is not a proof that a log holds no secret. Read a log before
  you share it.
- The file stops at 4 MiB. Then it moves to `agent.log.jsonl.1` (the older copy is
  dropped) and the new file starts with a `note` record that says so.
- A failed log write never stops a run. The command prints a warning at the end.
- `remove` deletes the log with the issue.

## Notifications

Set `notifyCommand` in `.ai.local/desk/config.json`. The desk runs it at a human gate, at
`needs-you`, and when an issue ends. There is no shell. The command is an argv array, or
a string that the desk cuts into words (single quotes, double quotes, and `\` work;
`$HOME`, `|`, `;` and `` ` `` stay plain text).

- The program gets `DESK_ISSUE`, `DESK_STAGE`, `DESK_KIND` (`gate`, `needs-you`, or `done`),
  and `DESK_MESSAGE` as environment variables.
- A word may contain `{issue}`, `{stage}`, `{kind}`, or `{message}`. The desk replaces
  them in place. The text stays one argument.
- The command has 10 seconds. A failure, a missing program, or a timeout prints a warning
  and never stops the run.

macOS, with `osascript` (the message arrives through the environment):

```json
{
  "notifyCommand": [
    "osascript",
    "-e",
    "display notification (system attribute \"DESK_MESSAGE\") with title \"Agent desk\""
  ]
}
```

macOS, with `terminal-notifier`:

```json
{ "notifyCommand": "terminal-notifier -title 'Desk #{issue}: {kind}' -message '{message}'" }
```

Linux: `{ "notifyCommand": "notify-send 'Desk #{issue}' '{message}'" }`.

## Pipeline engine

`createPipelineRunner(deps)` in `src/engine/pipeline.runner.ts` drives an issue. Every
stage change goes through the pure `transition()` machine. A stage handler does the
side effects and reports an outcome. Only the runner applies it. The runner writes
`state.json`, appends to `events.jsonl`, sets labels and the status comment, and calls
`notify` at a gate or a stop.

| Call                                  | What it does                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `start(n, {override, snapshotFile?})` | Run intake, then drive to the next stop. Run it again to retry intake.            |
| `advance(n)`                          | Drive from the current stage to a gate, `needs-you`, or the end.                  |
| `approvePlan(n)`                      | At `plan-gate`: rename the branch if the planner chose another name, then drive.  |
| `feedback(n, target, text)`           | Send feedback to `plan`, `build`, or `review`. Loop budgets reset. Then drive.    |
| `continueFrom(n, stage?)`             | From `needs-you`, retry the recorded stage. Never automatic. Then drive.          |
| `cancel(n)`                           | Stop the running agent, end the issue. The worktree stays.                        |
| `remove(n, {force, keepWorktree})`    | Delete the state and the worktree. It refuses a dirty worktree. The branch stays. |
| `status(n?)`                          | Read one issue or all. It also returns the `needs-you` reason.                    |
| `ship(n, {confirm, dryRun?})`         | From `pr-review`: commit, push, draft PR. A dry run changes no state. See "Ship". |

Each call returns `stopped` (`gate`, `needs-you`, `shipped`, `cancelled`, with a
message) or `refused` (a typed `refusal` such as `leased`, `invalid-transition`,
`ship-refused`, and a reason). A refusal changes nothing. A ship dry run returns
`dry-run` with the ship plan.

### Stages

| Stage       | Who      | What happens                                                                                                                           |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `intake`    | engine   | Read the issue, prove authorization, write `ticket.md` and `issue.json`.                                                               |
| `setup`     | engine   | Pick the provisional branch (`fix` for a `bug` label, else `feat`). Run the worktree recipe. Record branch, worktree, and base commit. |
| `plan`      | planner  | Read-only. Result: `plan.json` and `plan.md`. Open questions show at the gate.                                                         |
| `plan-gate` | you      | Approve, or send feedback. Feedback resumes the planner session.                                                                       |
| `build`     | builder  | Resumed session. Gets the plan, feedback, the last check failure, or the last blocking review findings.                                |
| `check`     | engine   | `pnpm generate`, drift check, then the configured loop checks. One check runs at a time.                                               |
| `review`    | reviewer | Fresh, read-only session. Reads `diff.patch`. Default provider is the other one than the builder.                                      |
| `pr-review` | you      | Feedback goes to `build`, `review`, or `plan`. Then `ship`.                                                                            |
| `needs-you` | you      | Every failure lands here with a reason and a `resumeStage`.                                                                            |

A check failure goes back to `build` up to `maxTestLoops` times. The same failure twice in
a row stops early. A review with blocking findings goes back to `build` up to
`maxReviewLoops` times. After the limit the issue goes to `needs-you`.

### Invariants

`runAgentStage` (`pipeline.agent.ts`) is the only place an agent runs. Around every
agent stage it checks these rules, whether the run succeeded or not:

- HEAD, the branch, every ref, each remote, and the stash are the same after the run.
- A read-only role (planner, reviewer) leaves the worktree diff hash unchanged.
- The run shows its skill evidence: a `Skill` call, or a read of `SKILL.md`.
- No forbidden command, no permission denial, no claimed check that did not run.
- The builder changed only files that the plan lists (or generated GraphQL output),
  and no protected path.
- The result passes the contract schema. The runner parses it, and the engine parses it again.

A violation moves the issue to `needs-you` with every violation in the reason. The
worktree stays as the agent left it. The agent session is not kept.

When all rules hold, the engine records the **refs baseline** (`refs-baseline.json`): HEAD,
the branch, every ref, each remote, and the stash. It does this after every agent stage.
The ship gate compares the worktree with the latest baseline. Without a baseline the gate
fails closed (`refs-baseline-missing`).

### Ship

`ship` is the only step that commits, pushes, or opens a PR. The engine does it, never an
agent. It runs only from `pr-review`, only with your explicit yes.

- `ship <n> --dry-run`: write `ship-plan.json`, `pr-body.md`, and `commit-message.txt` in the
  artifacts folder, print the plan, and change nothing. The plan shows the gate verdict, the
  files, the PR title, the changeset decision, and the path of `pr-body.md`. Exit 1 when the
  gate would refuse.
- `ship <n> --confirm`: ship now.
- `ship <n>` without a flag: on a terminal it asks `Ship #n as a draft PR? [y/N]`. Without a
  terminal it refuses with exit 1.
- `--dry-run` and `--confirm` do not go together.

The gate must pass first. Every rule must hold, and a refusal lists all failed rules and
changes nothing: you confirmed; the check report passed and matches the diff; `gh` is signed
in as the owner; the branch name is valid; the authorization snapshot still holds (it reads
the issue again); the refs match the baseline; no protected path is in the diff; the plan was
approved; the reviewer approved the same code. A snapshot-file issue fails the
authorization check, because the real issue differs.

After the gate, the engine enters the `ship` stage and runs: the ship checks (`pnpm check`),
the changeset file or the `release:skip-changeset` label, a commit through the repository
hooks, a rebase onto `origin/main` if needed (with the checks again), a push of the branch,
and `gh pr create --draft`. It sets the label `agent:pr-open` and edits the status comment
with the PR link. The issue is `shipped`.

Safety rules:

- The PR is always a draft against `main`. The desk never merges, approves, enables
  auto-merge, or marks the PR ready. You review it and merge it yourself on GitHub.
- No `--no-verify`, no force push, no `--amend`. The hooks run. Commit and PR text pass the
  AI-attribution check.
- The commit holds exactly the files of the diff (plus the changeset file). Protected paths
  stop the ship.

A failure after the first change (a hook refuses, a push is rejected, a rebase conflicts)
moves the issue to `needs-you` with `resumeStage: ship`. The reason has the failure and the
redacted tail of the output. Fix the cause, then run `pnpm desk continue <n>`. The ship
continues where it stopped: it makes no second commit and no second PR. `continue` retries a
ship only if you confirmed it before. A new `ship --confirm` is not valid there.

### Why these checks exist

These facts come from real runs (claude 2.1.282, codex-cli 0.147.0).

- A deny prefix can be bypassed. With `Bash(git:*)` allowed and `Bash(git commit:*)`
  denied, both `git -C . commit` and `git -c k=v commit` ran. The allowlist therefore
  names only read-only git subcommands. A narrow allowlist denied those forms. Deny rules
  stay as a second layer. The HEAD and ref check is the layer that cannot be bypassed.
- An allow rule does not restrict the `Skill` tool. Only a deny rule does. The desk
  denies every skill outside the role list by name.
- Under `dontAsk`, mutating shell commands and writes are denied unless allowed. Read-only
  shell commands such as `echo` run anyway. `--allowedTools` is not a strict list.
- The bare `Read` tool reads any absolute path. A `Read` of a file in the desk state
  folder works without `--add-dir`. So the desk passes the diff as a path
  (`diff.patch`) and the ticket inline. Codex in the `read-only` sandbox also reads
  files outside the worktree. (Probed with haiku in a scratch repo.)
- A hook that returns `ask` is a denial in a headless run.
- Codex: `exec resume` accepts neither `-C` nor `-s`. The runner sets the sandbox with
  `-c sandbox_mode=...` and the directory with the process cwd. `-s workspace-write` makes
  `git commit` fail, but Codex reports no permission denial: the stream shows only a failed
  command. Only the ref and diff checks see a Codex sandbox escape. `--ignore-user-config`
  does not stop Codex from loading user-level skills in `~/.agents/skills`.
- A Codex builder is disabled. The config has no opt-in field yet, so the engine passes
  `allowCodexBuilder: false`.

### Concurrency, leases, and recovery

- One issue never runs two actions at once. Actions for an issue queue (`createScheduler`).
- At most `maxConcurrentAgents` agent processes run. A slot is held only while the process
  runs, never at a gate. One `check` runs at a time. A handler that throws releases its slot.
- A per-issue lease (`lease.json`) stops a second desk process. The second call gets
  `refused: leased` with the pid of the holder.
- The agent child pid and its start time are saved in `state.json` (`activeProcess`).
- `recoverInterrupted(store, deps)` turns each `running` or `queued` issue into `needs-you`
  with its stage to retry and a note. It never resumes anything. It stops a leftover agent
  process group only if the pid still has the recorded start time. It skips an issue
  whose lease a live process holds. `advance` does the same for its own issue.

### Artifacts

Under `<state>/issues/<n>/artifacts/`: `ticket.md`, `issue.json`, `plan.json`, `plan.md`,
`feedback.md`, `build.json`, `check-report.json`, `diff.patch`, `review.json`
(the review and the findings the engine rejected), `agent-<role>.json` (session, usage,
denials, tool calls), `receipts-<role>.jsonl`, and `run-settings-<role>.json`.
Ship adds `refs-baseline.json`, `ship-plan.json`, `pr-body.md`, `commit-message.txt`,
`ship-record.json` (what the ship did so far), and `ship/check-report.json`.

### Development path without GitHub

`start(n, {override: true, snapshotFile})` reads an issue snapshot from a JSON file
(`issueSnapshotSchema`). The file is not a trusted source, so `override` is required.
Nothing is written to GitHub for that issue. The CLI keeps this for the later calls.
See "Try it without GitHub".

## Intake

`desk start <issue>` does these steps:

1. Check that `gh` is signed in as the owner (see Authorization).
2. Read the issue and its label events.
3. Prove who applied `ready-for-agent`, or accept `--override`.
4. Read the issue body against the six-heading contract in
   [`triage-labels.md`](triage-labels.md). The desk reports "contract N/6". It does
   not decide readiness: `kaine-intake` or a human does.
5. Write `artifacts/ticket.md`, then move the issue to `setup` with status `waiting`.

Intake needs at least one acceptance criterion. Without one, the issue goes to
`needs-you` with the reason. Fix the issue, then run `desk start` again. A closed
issue also goes to `needs-you`. After a successful intake, `start` goes on to setup
and the planner.

## State

State is in `<git-common-dir>/kaine-desk/`. Run `git rev-parse --git-common-dir` to
find it. It survives worktree removal. It is never committed. Each issue has
`state.json`, `events.jsonl`, `agent.log.jsonl`, `artifacts/`, and `lease.json` (while a
desk process drives it). A `no-writeback` file marks an issue that writes nothing to GitHub. A corrupt issue shows
as `unreadable` and does not block other issues.

## Authorization

- `gh` must be signed in as the owner. For a personal repository, the owner is the
  repository owner. For an organization repository, set `owner` in
  `.ai.local/desk/config.json`. The desk stops if it is missing.
- The latest `ready-for-agent` label event must be a `labeled` event by the owner.
- `--override` skips the label check for the owner's own run. The desk logs it in the
  event history and in the status comment. It does not skip the identity check.
- The desk stores a fingerprint of the title, body, and trusted comments. Trusted
  means OWNER, MEMBER, or COLLABORATOR. The desk's own status comment is excluded.
  Only trusted text enters `ticket.md`, fenced as untrusted data.

## GitHub write-back

`desk start` sets one execution label and edits one status comment. Pass
`--no-writeback` to skip both. A write failure is logged and never fails the run.

The status comment starts with `<!-- kaine-desk:<issue> -->` and is edited in place.
The desk never adds or removes `ready-for-agent` or another triage label. See
"Agent execution labels" in [`triage-labels.md`](triage-labels.md). Without the
labels in the repository, label writes fail and are logged.

## Doctor

`desk doctor` checks Node, pnpm, git and worktree support, `gh` and its identity, the
config file, and the `claude` and `codex` CLIs. It reads `claude --help` and
`codex exec --help` and checks that each required flag exists. A missing provider
that a role uses is an error. A provider that no role uses is a warning.

It also checks Docker: the daemon, the worker image, and the provider logins. With
`isolation: "host"` a missing daemon or image is a warning. With `isolation: "docker"` it is an
error. `desk doctor --probe` and `desk docker doctor` also run the isolation probes.

## Config

Optional file: `.ai.local/desk/config.json` (gitignored). Without it, the desk uses
defaults. A file that exists but is invalid is an error. Fields are listed in
`tooling/desk/src/contracts/desk-config.contract.ts`.

The `docker` block sets the limits of the containers. All fields are optional:

```json
{
  "isolation": "docker",
  "docker": {
    "agent": { "memory": "6g", "cpus": 4, "pidsLimit": 1024 },
    "check": { "memory": "6g", "cpus": 4, "pidsLimit": 2048 },
    "maxPatchBytes": 8388608,
    "forwardEnv": []
  }
}
```

`forwardEnv` lists host variables that go into the agent container by name. Only
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `CLAUDE_CODE_OAUTH_TOKEN` are allowed. The default is
empty: the container uses the login in the auth volume. Docker Desktop must have enough memory
for the limits (8 GB in the VM is the minimum that was tested).

## Try it without GitHub

This runs the whole pipeline on a made-up issue. It needs no GitHub issue, and it writes
nothing to GitHub. It does start the real agents, so it uses tokens. The default reviewer
is Codex; set `providers.reviewer` to `claude` in `.ai.local/desk/config.json` if you have
only Claude.

The fixture `tooling/desk/fixtures/docs-issue.snapshot.json` is issue 9001. It asks for a
short "Quick start" section in `docs/agents/day-one.md`. It has all six contract headings,
and each criterion can be checked by reading the worktree.

```sh
pnpm desk doctor
pnpm desk start 9001 --override --no-writeback --snapshot-file tooling/desk/fixtures/docs-issue.snapshot.json
pnpm desk status 9001
pnpm desk approve 9001          # after you read the plan
pnpm desk logs 9001             # add --follow in a second terminal while it runs
pnpm desk remove 9001 --force   # --force: the worktree holds the agent's uncommitted edit
```

- `start` stops at the plan gate. Read the plan it prints (`artifacts/plan.md`).
- `approve` runs build, check, and review, and stops at `pr-review`. Read the diff in the
  worktree (`pnpm desk status 9001` shows its path).
- Nothing is committed, pushed, or opened as a PR. `remove` deletes the desk state and the
  worktree. The branch stays: delete it with `git branch -D <name>` (`git branch --list 'KAINE-9001-*'`).

## Serve

`pnpm desk serve [--port N] [--no-open]` starts the local server (`serveDesk`). It runs the
same engine as the CLI and listens on `127.0.0.1` only. Without `--port` it picks a free
port. It prints `Agent desk: http://127.0.0.1:<port>/#session=<token>`. Open that link
once: the token works one time. `--no-open` does not open a browser. Every `/api/*` route
except the session start needs the cookie, so a request without it gets `401`. Ctrl-C closes
the server and exits 0. A running action is not cancelled: the next start marks it
`needs-you`. See [`agent-desk-api.md`](agent-desk-api.md).

The server serves the built UI from `tooling/desk-ui/dist`. When that folder has no
`index.html`, `serve` builds it first with `pnpm --filter @repo/desk-ui build` and says so.
If the build fails, the server still starts with the API only and prints the end of the
build output.

## The desk UI

`tooling/desk-ui` (`@repo/desk-ui`) is the React front end of the same engine. It is local
developer tooling. It has three views:

- **Board.** A kanban with four columns: _Needs you_, _Waiting for you_, _Running_, and
  _Done_. Each column has a count and one line of help. From 64 rem the columns stand side by
  side in a board of stable height, and each column scrolls by itself. Below that they stack,
  _Needs you_ first: on a phone the engineer reads top-down, and a segmented control would
  hide three columns behind taps. _Done_ shows the newest 12 and "Show all".
  - The toolbar has a search (number with or without `#`, or words of the title; `/` focuses
    it, Escape or the clear button empties it) and **Start issue**. That opens a small dialog
    with the number and the `override` box. The override runs the issue on your own authority
    instead of the `ready-for-agent` label event. The desk logs it. The result is a toast; a
    refusal keeps the dialog open, and a refusal that arrives later is a toast too.
  - A compact card reads only the summary, never the detail: the number and title (two lines,
    full title in a tooltip when cut), **one status chip** that joins stage and state ("Plan
    approval · waiting for you", "Build · running", "Needs you", "Shipped"), an 8-segment
    progress bar of the flow nodes (the current segment is taller; its name says "Stage 4 of
    8: Build (Running)"), the needs-you reason, the branch, the time in the current stage (one
    shared clock for the page), a PR icon link, and the next action: **Continue** (needs you),
    **Review plan** or **Review and ship** (open the issue), a spinner while it runs, or
    **Open PR** once shipped. Only the title and the buttons are interactive.
  - `tooling/desk-ui/src/status/status.model.ts` is the one mapping from a summary to the
    column, the tone, the chip words, the gate mode, and the next action, and from a node
    status to its tone. It also cuts an engine reason to its first sentence, joining a line
    that ends on a colon with the next line. Every view reads it.
- **Issue.** A header, the **pipeline** card with **Activity** and **Log** tabs below it, and
  the **inspector**. From 64 rem the inspector stands to the right (24 rem, sticky, with its
  own scroll). Below that it sits directly under the header, before the pipeline.
  - The header has the back link, the number and title, **one status chip**, and compact
    facts: the branch (with a copy button and a toast), the contract as a small progress bar
    ("5/6"), the loop counts, the time in the stage, and the GitHub and PR links. Skeletons of
    the final size stand in while the detail loads.
  - The graph is React Flow with the fixed positions of the flow model, scaled for the
    canvas so the whole pipeline fits the main column of a 1440 px desktop. Only a narrower
    column frames the stages around the current one. It is read-only: the nodes cannot be
    moved or connected. Each node has a round role icon (agent, you, engine, issue), its
    status in words beside its color, "Run 2 · 1m 1s" (the running stage ticks with the
    page clock), and a one-line note with the full text in a tooltip. The card header has a
    legend (Passed, Running, Waiting for you, Went back, Stopped). Loop-back edges are dashed
    arcs with their counts; the active edge moves unless the system asks for reduced motion.
    The graph fits itself on the first size and on a resize only, so a new event never undoes
    the engineer's pan and zoom; the Fit control fits again. A click, or Enter or Space on a
    focused node, selects the stage. On a touch screen a drag scrolls the page. Below 40 rem a
    vertical **stepper** (icon, stage, status, run, note) replaces the graph and is a keyboard
    path; wider screens keep the stages in words for a screen reader.
  - **Activity** shows `history` as aligned rows, newest first and grouped by stage run with
    loop rounds ("Check · round 2"): the local time, the event in words, the note (full text
    in a tooltip when cut), the time to the next event, and a status pill. **Log** is the live
    log with a local `<time>` per row and "Jump to latest".
  - The **inspector** shows the selected stage (the current one until the engineer picks
    another; the pick stays while new data arrives). It can change from the graph, the
    stepper, or its own stage select. It has the role icon, the title, who works there, a
    status pill, and four tiles of one size: runs, last or running duration, loops, and one
    of the stage's own (files in the plan, files changed, steps passed, findings with the
    blocking count, ship readiness, the PR or commit, or the contract). Checklists follow
    with ✓, ✗, ! or – and the state in words: acceptance criteria and open questions (plan),
    the builder's claimed checks (build), each check step with its duration and the failing
    output on demand (check), the verdict, findings by label, and the reviewer's acceptance
    status with evidence (review), the four ship rules (PR review and ship), and the contract
    sections (ticket). Anomaly chips name loops ("Check went back 2×"), a stop with the first
    sentence of its reason, tool calls blocked by the permission rules (from the log), and an
    early stop for the same check failure. **Open full result** opens the drawer with the
    stage's full artifact; ticket text, diffs, and logs stay plain text.
  - The decision is pinned at the bottom of the inspector and follows the gate mode. At the
    plan gate: **Approve plan**, and **Request changes**, which opens the feedback form in
    place. At PR review: **Ship as draft PR…**, and **Request changes** with the target
    (build, review, plan) in a segmented control. When the desk needs you: the engine's reason,
    **Resume from** (the remembered stage by default), and **Continue**. While an agent runs:
    a spinner, the stage, and the time in it. After a ship: the PR link and, once on the page,
    the note that you merge it yourself. **Cancel run** and **Remove** sit in a **More** menu
    beside the decision title. Both ask first, and focus returns to the menu button. Remove has
    a force box for a worktree with changes. Controls that start work are disabled while an
    action runs; Cancel and Remove stay enabled. Every result is a toast, and focus moves to
    the decision heading after an action that worked.
  - **Ship as draft PR…** opens a dialog with two steps. Step 1 runs the dry run, which
    changes nothing, and shows the gate result, the commit message, the PR title, the
    changeset decision, the files, and the PR text. Step 2 asks for the final yes. Only that
    yes sends `confirm: true`. A failed gate rule disables step 2.
- **Health.** The doctor report with a status in words for every check.

The page needs no polling. It loads `GET /api/issues` once, opens `GET /api/events`, and
reloads the list after every (re)connect with exponential backoff, so a missed event is not
lost. A `401` shows "reopen the launch link". The top bar is one row at every width: the
brand mark (the full name from 48 rem, a short one between 30 and 48 rem), the Board and
Health pills, one polite "Live"/"Reconnecting" status, and a preferences menu. Theme (light,
dark, or system, which follows `prefers-color-scheme`) and language (English, German,
Serbian) switch there at once and keep what you typed and where you scrolled. The live log
shows each row's time once, as a local `<time>` in the page language. The strings are in the
`desk` namespace of `packages/translation`. Colors, spaces, and fonts are `--ds-*` tokens
only, including the React Flow variables.

### Dev flow

1. `pnpm desk serve --port 4777 --no-open` in one terminal. It prints the launch link.
2. `pnpm desk:ui` in another terminal. This starts Vite on `http://localhost:5174` and
   proxies `/api` to `127.0.0.1:4777` (change it with `DESK_API_TARGET`).
3. Open the launch link, but with the Vite address: replace `http://127.0.0.1:4777` with
   `http://localhost:5174` and keep `#session=<token>`.

Tests: `pnpm --filter @repo/desk-ui test` (logic and component tests) and
`pnpm --filter @repo/desk-ui test:browser` (builds the UI, then runs Playwright against a
fixture server: the real desk HTTP layer over a temporary store with a scripted runner). Run
`pnpm --filter @repo/desk-ui exec playwright install chromium` once.

### Known limits

- The server's CSP is `style-src 'self'`. Radix (in `@repo/ui`) injects one `<style>` element
  for scroll locking and one for the select list. The browser blocks them and logs
  "Applying inline style violates…". The page works. A dialog does not lock the scroll of the
  page behind it, and a select list shows a native scrollbar. A fix needs a per-response
  nonce or style hashes in the server CSP. The browser tests skip only this one message.
- Sonner (the toasts) also injects a `<style>` element, which the CSP blocks with the same
  message. The page bundles `sonner/dist/styles.css` instead, so toasts keep their layout.

## Docker isolation

Host mode is the default. It is not a security boundary against a prompt-injected builder
that runs repository scripts. Docker mode closes that gap. Start an issue with
`pnpm desk start <n> --isolation docker`, or set `"isolation": "docker"` in the config. The
choice is saved in the state of the issue, so later calls need no flag. `--isolation host`
overrides the config for one issue.

See [ADR 0011](../adr/0011-local-agent-desk.md) for the decision.

### What runs where

| Step                                                   | Host mode | Docker mode                              |
| ------------------------------------------------------ | --------- | ---------------------------------------- |
| Intake, setup (worktree, `pnpm install`, `ai:install`) | host      | host (trusted code from `origin/main`)   |
| Planner, reviewer (read-only)                          | host      | host (they run no repository code)       |
| Builder                                                | host      | container                                |
| Check stage (`pnpm generate`, loop checks)             | host      | container, one container per step        |
| Ship (commit, push, PR, ship checks)                   | host      | host (ship checks still run on the host) |

The host worktree stays the canonical copy. The container has its own copy in a Docker volume.
Nothing is bind-mounted from the worktree.

### Threat model

Docker mode protects the host from a prompt-injected agent and from scripts it plants in the
repository. In a container the agent has:

- no network interface (`--network none`). Its only way out is a unix socket to a proxy
  container that tunnels CONNECT to the provider hosts (`api.anthropic.com`, `claude.ai`,
  `platform.claude.com`, `console.anthropic.com`, `api.openai.com`, `chatgpt.com`,
  `auth.openai.com`, `auth0.openai.com`) on port 443. TLS stays end to end.
- no host file. The container sees only its volumes and one read-only folder of staged files.
- no `GH_TOKEN`, no cloud credential, no SSH agent, no Docker socket. Environment variables
  are explicit, never inherited.
- a read-only root file system (tmpfs for `/tmp` and the home folder), no capabilities
  (`--cap-drop ALL`), `no-new-privileges`, a non-root user, `--init`, and limits for pids,
  memory (swap off), and CPUs.

It does not protect against these, and the owner still decides on them:

- The provider sees the prompt and the code the agent reads. That is true in host mode too.
- A patch that the agent writes can still contain bad code. The patch guard and the engine
  invariants stop paths and refs that must not change. The owner reads the diff at `pr-review`.
- The agent can use the provider login that is in the container (it can read it). The login has
  no other way out than the provider hosts.
- Ship checks (`pnpm check` before the commit) run on the host, after the owner approved the diff.

### Commands

```sh
pnpm desk docker build                       # build the image (about 2 GB, a few minutes the first time)
pnpm desk docker login --provider claude     # log in inside a container (needs a terminal)
pnpm desk docker login --provider codex
pnpm desk docker doctor                      # daemon, image, logins, and the isolation probes
pnpm desk docker status                      # desk containers, volumes, and images
pnpm desk docker prune --issue 123           # remove the containers and volumes of one issue
pnpm desk docker prune --all --yes [--auth]  # remove all desk containers and volumes
```

`prune --all` keeps the logins unless you add `--auth`. Every removal selects resources by the
label `kaine-desk=1` and checks that the name starts with `kaine-desk-`. It then lists again to
verify. It never touches a resource of another tool. The image is not removed by `prune`. To
remove it: `docker image rm kaine-desk-worker:<tag>` (`pnpm desk docker status` shows the tag).

The image tag is a hash of the Dockerfile, the scripts, and the pinned versions (Node image
digest, pnpm from `packageManager`, Claude Code, Codex). A change gives a new tag, and
`desk doctor` says that the image is out of date. Rebuild with `pnpm desk docker build`.

### How work moves

- **In.** Before a container step, the host sends `git bundle` of the base commit (only when the
  volume lacks it), `git diff --binary` of the work in progress, and the agent files (skills in
  `.claude/skills` and `.agents`) as a read-only folder. A helper container makes `/workspace`
  equal to base plus patch. It reports a diff hash, and the host compares it with its own hash.
  A mismatch stops the step. A tracked file that is not valid UTF-8 can cause a mismatch.
- **Dependencies.** A fetch container fills the pnpm store through a proxy that allows only
  `registry.npmjs.org:443`. It runs no repository script. Then `pnpm install --offline
--frozen-lockfile` runs in a container with no network. The host `node_modules` is never copied.
  The install repeats only when `pnpm-lock.yaml` or `pnpm-workspace.yaml` changed. The agent
  cannot add a dependency in Docker mode (it has no network).
- **Out.** After the step, the helper prints the patch since the import. The host applies it with
  `git apply` only when all these rules hold: it starts with `diff --git`; it is at most
  `maxPatchBytes` (8 MiB) and 2000 files; Git itself lists no protected path (`.git`, agent
  installs, hooks, workflows, `.env`, `node_modules`, and the other paths in `src/policy`); it
  creates no symbolic link and no submodule; the worktree is still as the import left it; and the
  hash of the worktree after the patch equals the hash that the container reports. A refused patch
  changes nothing. The step goes to `needs-you` with the reasons.
- Then the usual host checks run: refs, branch, remotes, stash, scope against the plan, and the
  diff hash.

The check stage works the same way. The report has the same fields. Generated drift comes back
to the host worktree as a patch, as it stays in the tree in host mode.

### Logins

`pnpm desk docker login --provider claude|codex` runs the provider's own login flow in a container
with a terminal. The login lands in the volume `kaine-desk-auth-<provider>`. The desk never reads
it. An agent container mounts that volume read-only. The entry script copies the login files into
the per-issue state volume, where the CLI works (and keeps its sessions, so `--resume` works). If
the CLI refreshes its token, a short container copies the refreshed token file back to the auth
volume after the run, but only when it is valid JSON of the right shape and newer. If the copy
fails, the next run refreshes again. If the provider rotates refresh tokens, you may need to log
in again.

### Codex in Docker

Codex can run its own sandbox only on the host. Inside a container that sandbox cannot start, and
the container is the sandbox. In Docker mode the Codex builder runs with
`--dangerously-bypass-approvals-and-sandbox`. The runner emits this flag only when two things
hold: the request has `containerSandbox`, and the runner was created by the Docker isolation.
A host runner refuses such a request. The flag is only for the builder. A Codex builder in Docker
needs no `allowCodexBuilder` opt-in. A Codex builder on the host still needs it.

### Cleanup and recovery

- `desk remove <n>` removes the containers and volumes of the issue and verifies it. If it cannot
  verify, it refuses and keeps the state. With `--force` it deletes the state and tells you to run
  `pnpm desk docker prune --issue <n>`.
- A killed `docker run` client can leave its container. After every container run the desk removes
  containers by label and checks that none is left. A leftover container fails the run.
- Recovery after a crash (and `cancel`) removes leftover containers of the issue and writes a note.

### Limits

- The first run of an issue is slow: the import, then fetch and install of all dependencies. On
  macOS the volumes live in the Docker VM, and installs and tests are slower than on the host.
- No MCP server (Serena) in a container: it needs a network or a host tool.
- No browser or Playwright in the image. Checks that need a browser fail in a container.
- The image is about 2 GB (Node, git, a C toolchain for native modules, Claude Code, Codex).
- Checks run on Linux. A check that passes on macOS can fail in the container, and the other way
  round.
- Ship checks run on the host.
- The agent log redaction (`redact()`) applies. The stream is not filtered in the container.

### What is verified, and what is not

Verified in tests with real Docker (`DESK_DOCKER=1`, see below): the image builds; the pinned CLIs
start; the isolation probes pass; a local test proxy lets only its allowed host through; the
dependency proxy allows only the npm registry; a scripted stand-in for the builder edits files in
the container and the patch round-trips to a host repository (text, binary, delete, mode bit); a
hostile patch is refused; check steps run in containers and generated drift comes back; a login is
copied in, a refreshed token is copied back, garbage is not; cleanup leaves no labelled resource;
and the real `claude` and `codex` CLIs start in the container and stop at a missing login.

**Not verified: a model run in a container.** That needs a login, and the login flow needs you.
Use this checklist:

1. `pnpm desk docker build`, then `pnpm desk docker doctor`. All rows must be `ok` (login rows are
   warnings until you log in).
2. `pnpm desk docker login --provider claude`. Finish the login in the terminal. Then
   `pnpm desk docker doctor` shows the volume. Do the same for `codex` if a role uses it.
3. Run the fixture issue:
   `pnpm desk start 9001 --override --no-writeback --snapshot-file tooling/desk/fixtures/docs-issue.snapshot.json --isolation docker`,
   then `pnpm desk approve 9001`.
4. While the builder runs, in a second terminal: `docker ps` must show one
   `kaine-desk-...-agent-...` container, and `pnpm desk logs 9001 --follow` must show tool calls.
5. Check that the build stage passed verification (skill evidence, receipts, scope). If it went to
   `needs-you`, read the reason. A missing skill evidence or receipt in Docker mode is a defect to
   report.
6. After `pr-review`: the worktree has the change (`git -C <worktree> status`), and
   `pnpm desk remove 9001 --force` leaves `pnpm desk docker status` with no volume of the issue.
7. Not yet seen: a token refresh across several runs, a Codex builder in Docker, and the first
   install of the real monorepo (time and memory).

### Tests

The default suite is Docker-free: it uses a fake `Exec` and a fake daemon. The `.mjs` helpers have
`node --test` tests in `tooling/desk/docker`. They run in `pnpm --filter @repo/desk test`.

The real-Docker tests run only with `DESK_DOCKER=1`:

```sh
DESK_DOCKER=1 pnpm --filter @repo/desk exec vitest run src/isolation/docker.integration.test.ts
```

They need Docker, the network (one `pnpm fetch` of one small package), and a few minutes. They
label every resource `kaine-desk=1` and remove all of it, also on failure. They do not touch an
existing `kaine-desk-auth-*` volume: the tests that need one skip themselves.

## Planned

- After the first verified real draft PR: retire the factory.
