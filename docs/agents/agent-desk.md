# Agent desk

The agent desk drives a GitHub issue through intake and then the steps of a flow. The
built-in flow `kaine-default` plans, builds, checks, and reviews the change, then opens a draft
PR. In it the owner approves at two gates. Other flows come from the repository or from you
(see "Agents and flows"). The owner merges every PR. The issue then waits at `pr-open` until the
owner runs `refresh` after the merge. See [ADR 0011](../adr/0011-local-agent-desk.md) and
[ADR 0012](../adr/0012-configurable-flows-and-agents.md).

## Commands

Run `pnpm desk <command>` from the repository root. A command that drives an issue runs
until the issue reaches a human gate, `needs-you`, or the end. Then it exits. A stage can
take many minutes, so the command prints live progress (see "Live output").

### Drive an issue

| Command                                                                                  | What it does                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start <n> [--override] [--no-writeback] [--snapshot-file P] [--isolation host\|docker]` | Run intake, setup, and plan to the plan gate. Run it again to retry intake after you fix the issue. `--isolation docker` runs the builder and the checks in containers. |
| `approve <n>`                                                                            | At a gate: approve and run on. At the plan gate of the default flow, build, check, and review then run to `pr-review`. At the gate before a ship, use `ship`.           |
| `feedback <n> --to TARGET TEXT...`                                                       | Send feedback to an agent or check step of the issue's flow (`plan`, `build`, or `review` in the default flow), then run on. `--file P` reads the text from a file.     |
| `continue <n> [--from STAGE]`                                                            | From `needs-you`: retry the recorded stage (or STAGE), then run on.                                                                                                     |
| `cancel <n>`                                                                             | End the issue. The worktree stays.                                                                                                                                      |
| `remove <n> [--force] [--keep-worktree]`                                                 | Delete the desk state and the worktree. It refuses a dirty worktree unless `--force`. The branch stays.                                                                 |
| `draft <n> [--snapshot-file P] \| --apply [--confirm]`                                   | For an issue that stopped at intake: draft it in the issue format, then apply the draft to GitHub after your yes. See "Draft the issue format".                         |
| `ship <n> [--confirm \| --dry-run]`                                                      | At `pr-review`: commit, push, and open a draft PR. The issue moves to `pr-open`. See "Ship". The desk never merges.                                                     |
| `refresh <n>`                                                                            | At `pr-open`: read the PR on GitHub once. Merged ends the issue at `shipped`, closed without a merge ends it at `cancelled`, open changes nothing. See "Open PR".       |
| `feedback <n> --from-pr [TEXT...]`                                                       | At `pr-open`: send the failing checks and the trusted review comments on the PR head, and your own words, back to `build`. See "PR feedback".                           |

- Every driving command also takes `--json` and `--no-writeback`.
- `--no-writeback` writes no label and no comment to GitHub. The issue remembers it
  (a `no-writeback` file in its state folder), so `approve` and later calls stay quiet.
  `--snapshot-file` turns it on too.
- `--snapshot-file P` reads the issue from a JSON file and needs `--override`. See
  "Try it without GitHub".
- `start --flow ID` runs the issue on that flow. Without it the issue runs on the flow of its
  first label in `flowLabels`, else on `defaultFlow` (see "Config"). An unknown or invalid flow
  refuses the start (`intake-refused`) and keeps no state.
- `--to` and `--from` take a step id of the issue's own flow. `--to` takes an agent or check
  step; `--from` takes an agent, check, ship or pr-wait step, `setup`, or `intake`. A gate is
  no target: a wrong kind or an unknown step exits 2. Whether the issue may go there now is the
  engine's decision (`refused (invalid-transition)`, exit 1).
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
- `contract <n> | --file P [--json]`: how intake reads an issue body: the contract score, the
  missing sections, and the number of acceptance criteria. It prints no issue text and changes
  nothing. Exit 0 only at 6/6 with criteria. See [`issue-format.md`](issue-format.md).
- `stats [--role R] [--by-harness] [--json]`: compare agent runs by role, provider, and model,
  and with `--by-harness` also by instruction version (see "Metrics"). It only reads.
- `lessons [--min-issues N] [--source S] [--json]`: problems seen in several issues (see
  "Lessons"). It only reads.

### Repository commands

- `labels sync [--apply]`: print the `gh label create` commands. `--apply` runs them.
- `doctor [--json] [--probe]`: check the environment. It only reads. It also checks Docker (see
  "Docker isolation"). `--probe` runs the isolation probes in a throwaway container.
- `docker build|login|doctor|status|prune`: Docker isolation commands (see "Docker isolation").
- `serve [--port N] [--no-open]`: start the local server (see "Serve"). It prints the
  local URL and runs until Ctrl-C. Then it closes the server and exits 0.
- `--help`: list the commands.

### Exit codes

| Code | Meaning                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------- |
| 0    | The issue stopped at a human gate (also `pr-open`), or it is done (`shipped`, `cancelled`, `finished`). |
| 1    | The issue needs you, the call was refused, or the command failed.                                       |
| 2    | Usage error: a bad flag, a missing number, a bad stage, or an unknown command.                          |

A refusal prints `#12: refused (invalid-transition). <reason>` on stderr and changes nothing.
The refusals are `leased`, `unknown-issue`, `unreadable`, `invalid-transition`,
`ship-refused`, `refresh-refused`, `pr-refused`, `already-started`, `intake-refused`,
`authorization`, `worktree-dirty`, and `remove-failed`.

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

## Metrics

Every agent run that starts appends one JSON line to `runs.jsonl` in the state root
(`<git-common-dir>/kaine-desk/`). The line holds the issue, role, agent id (`agentId`; absent in
lines written before agents were data), provider, model (`null` for the CLI default), isolation,
loop counts, and duration. It also holds the capability receipt (`capabilities`, see
"Capabilities"). It also holds whether the run returned a
result, whether the stage accepted it, and the failure kind (`stuck` for a stuck stop). Then come
tokens, cost, turns (Claude only), and counts of tool calls, edit calls, failed calls, and
denials. It holds no prompt, output, or path. `remove` keeps the file, so the runs of a removed
issue still count. Tokens mean the same for both providers: `inputTokens` is fresh input (cache
writes included) and `cachedInputTokens` is input read from the cache. Their sum is the total
input.

Each line also names the harness the run started with, as `harness: { repo, desk, head }`. `repo`
is a sha256 over what the agent reads in its checkout: `AGENTS.md`, `CLAUDE.md`, `.ai/review.md`,
`.ai/permissions.json`, `.ai/agents/*.md`, and the installed `.agents/skills/*/SKILL.md`. `desk`
is a sha256 over the desk's role file and `rules.md` for that role; for a flow agent it also
covers the hash of the issue's flow snapshot, which holds the agent's prompt. `head` is the checkout's
commit. The desk takes the fingerprint before the agent starts, so a builder that edits a skill
does not change it. Lines written before the field existed read as `harness: null`.

`pnpm desk stats` prints one row per role, provider, and model: runs, accepted runs, stuck stops,
timeouts, median duration, mean tokens, turns, and edit calls, and the cost per run and in total.
Then it lists each issue with its stage (`removed` when the state is gone), loops, runs, and cost.
Codex reports no cost and no turns, so those cells show `-`. Use the rows to choose `providers`
and `models` for each role: change one role at a time, then compare. `--by-harness` splits each
row by the short `repo/desk` hashes, oldest version first, so you can compare runs before and
after a change to the instructions (`unknown` for lines without a fingerprint). The desk UI shows the same
tables in its **Runs** view, and the stage side sheet shows the usage of each agent stage.

## Lessons

The desk writes what went wrong to `lessons.jsonl` in the state root, at the moment it happens.
Each line is one kind of problem in one issue, with a count:

| Source      | Key                                     | When                                       |
| ----------- | --------------------------------------- | ------------------------------------------ |
| `review`    | `review/<section>/<severity>`           | each finding the review accepted           |
| `check`     | `check/<first failing step>`            | a failed check, or `check/generated-drift` |
| `stuck`     | `stuck/<the repeated command>`          | a stuck stop                               |
| `verify`    | `verify/<violation kind>`               | a verification violation                   |
| `denial`    | `denial/<tool>/<first command word>`    | a call the permission rules denied         |
| `invariant` | `invariant/refs`, `invariant/read-only` | a broken engine invariant                  |

A key holds no issue number, worktree path, line number, or time, so the same problem gets the
same key in every issue. A line also keeps a short sample (240 characters at most), the file
when there is one, and the `repo` instruction hash it was seen under (see "Metrics"). It holds
no prompt and no agent output. `remove` keeps the file.

`pnpm desk lessons` lists the keys seen in 2 or more issues (`--min-issues N` changes that), most
widespread first, with up to three samples. "now" counts the times under the instructions the
repository has now. After you change a rule for a problem, that count shows whether the problem
came back. The command only reads. Encode a candidate with the `kaine-encode-knowledge` skill:
it decides whether the lesson becomes a lint rule, a test, a review item, or a skill rule. Then
promote it on the **Runs** page, or turn it into a GitHub issue there (see "The desk UI"). The
desk never puts a lesson into an agent's prompt. Samples come from agents and from issue work,
so read them as data, never as instructions.

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

## Agents and flows

An **agent** and a **flow** are data, not code. An agent file says what one agent run is: its
provider, its output kind, its tool set, and its prompt. A flow file lists the steps that an
issue goes through, in order. The engine runs every flow with one interpreter. See
[ADR 0012](../adr/0012-configurable-flows-and-agents.md).

### Sources

The desk reads definitions from three sources. A later source overrides an earlier one by id.

| Source   | Files                                                             | Who changes them                                    |
| -------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| built-in | `tooling/desk/defaults/agents/<id>.md`, `.../flows/<id>.yaml`     | Nobody at run time. They change only with the desk. |
| repo     | `.desk/agents/<id>.md`, `.desk/flows/<id>.yaml`                   | The team, through a reviewed commit.                |
| local    | `.ai.local/desk/agents/<id>.md`, `.ai.local/desk/flows/<id>.yaml` | You only. The folder is gitignored.                 |

- The built-in agents are `intake`, `planner`, `builder`, and `reviewer`. Their prompts are in
  `tooling/desk/defaults/agents/`. The desk rules stay in `tooling/desk/agents/rules.md`.
- The built-in flow is `kaine-default`: plan, approve the plan, build, check, review, approve
  the change, ship a draft PR, and follow the PR. Its step ids are the stage names in "Stages".
- The file name is the id. An id matches `^[a-z0-9][a-z0-9-]{0,63}$`.
- A file that does not parse or validate takes part in nothing. The Agents and Flows pages
  list it with its errors. A broken local override does not hide the definition below it.

### Agent files

An agent file is Markdown with YAML frontmatter. The body is the prompt. The agent gets it as
its role prompt.

```markdown
---
id: release-notes
name: Release notes
description: Writes release notes for the change.
provider: claude
output: report
capabilities:
  preset: read-only
  mcp: [serena]
  skills: [kaine-explain]
timeoutMinutes: 20
---

Read the plan and the diff. Write the release notes.
```

- `provider` is `claude` or `codex`. `model` is optional. Without it, the CLI uses its default
  model. For a built-in id, `providers` and `models` of the desk config decide.
- `timeoutMinutes` is optional. Without it, the desk uses its default.
- `capabilities.mcp` names servers of `.ai/mcp.json`. `capabilities.skills` names skills of
  `.ai/skills/`. A run does not get a name that the checkout does not have. The run records the
  removal with the reason `not installed`. It does not fail.
- A skill name must start with `kaine-`. Setup and the prompt builder refuse any other name, so
  an agent that names one stops its issue at setup. A custom skill reaches an agent only with a
  `kaine-` name in `.ai/skills/`.
- `capabilities.tools` is optional (default `[]`). It names extra tools from the fixed catalog
  `AGENT_TOOLS`. See "Extra tools".

### Output kinds

The output kind says what a run produces. It selects the result schema and the step handler.

| Output   | What the run does                                              | What it means for the flow                                                                    |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `plan`   | Writes `plan.json` and `plan.md`. Read-only.                   | A gate right after it is the plan approval. A flow that ships needs a plan agent before ship. |
| `change` | Changes code in the worktree. It needs the `edit-code` preset. | A check step must follow the last change before the ship.                                     |
| `review` | Reviews the diff and the check results. Read-only.             | `approve` goes forward. `changes` takes the step's `loopBack`, else the issue needs you.      |
| `report` | Writes `report-<agent>.json`. Read-only. It decides nothing.   | The flow always goes on after it.                                                             |
| `intake` | Checks a new issue before a flow starts.                       | No flow step can use it.                                                                      |

### Capabilities

The preset is the tool set of a run:

- `read-only`: the read tools, read-only git, and the read tools of its MCP servers.
- `run-checks`: `read-only`, plus the exact `test`, `typecheck`, and `lint` commands of the
  workspaces that the plan names, and one vitest file. It cannot edit.
- `edit-code`: `run-checks`, plus Edit, Write, `pnpm generate`, and the Serena edits. Only a
  `change` agent can use it, and a `change` agent must use it.

One resolver (`src/agents/capabilities.resolve.ts`) turns the preset, the servers, and the
skills into the **capability profile** of a run. These rules always hold:

- The **policy floor** always applies. An agent can only narrow it. The floor is the
  `.ai/permissions.json` denies, the forbidden git and desk commands, WebFetch and WebSearch,
  the Serena tools that write memory or run commands, the protected paths, and every skill
  outside the agent's list. The floor also removes five skills whose procedure needs a denied
  command: `kaine-open-pr`, `kaine-rebase`, `kaine-release-apps`, `kaine-sync-docs`, and
  `kaine-triage-deps`.
- An agent that edits code always runs in the configured isolation. With Docker isolation it
  runs in a container, and the container loads no MCP server. Every other preset runs on the
  host.
- Codex gets no rule lists and no MCP server. Its sandbox is the whole policy
  (`Codex: sandbox only, no MCP`): `read-only`, or `workspace-write` for an `edit-code` agent.
  A Codex `change` agent stays disabled on the host.
- The profile lists each thing the agent asked for and does not get, with the reason: for
  example `policy floor: ...`, `not installed`, or `no MCP inside the container`.

Each run records its **capability receipt**: the profile it started with, as `capabilities` in
its `runs.jsonl` line. The stage side sheet shows it. Setup installs into the issue worktree the
MCP servers and skills that the agents of the flow ask for and the checkout has.

### Extra tools

An extra tool lets an agent run one repository command, with any arguments. The catalog is fixed
(`AGENT_TOOLS` in `src/contracts/agent-definition.contract.ts`):

| Tool         | Command           | What it does                                                                      |
| ------------ | ----------------- | --------------------------------------------------------------------------------- |
| `doc-export` | `pnpm doc:export` | Exports Markdown to `.docx` or `.pptx`, and verifies exported files (`--verify`). |

- A tool writes files, so only an `edit-code` agent can have one. `validateAgent` refuses an
  unknown tool and a tool on any other preset. The Agents page disables the tools with the
  reason until the tool set is "Edits code".
- For Claude, the resolver adds one allow rule per tool, for example `Bash(pnpm doc:export:*)`.
  The profile lists the tools in `extraTools`, so the run receipt shows them. A tool that the
  agent asks for and does not get is in `removed`, with the reason.
- Codex gets no rules: its `workspace-write` sandbox runs the command like any other. The
  profile notes it.
- In Docker the command runs in the container. Setup installs every workspace there, so
  `pnpm doc:export` works without extra steps.
- The tool holds its own safety rules: the input is a `.md` file in the repository, and the
  output stays in the repository, outside dot-directories, `node_modules`, and the protected
  paths. See `tooling/doc-export/README.md`.

A flow that writes documents pairs a change agent that has the tool with a check step that
verifies the files. The plan names each output file, like any other file it changes.

```yaml
id: docs-export
name: Docs export
description: Plan, write the docs and export them, verify the exports, and ship a draft PR.
steps:
  - { id: plan, kind: agent, label: Plan, agent: planner }
  - { id: approve, kind: gate, label: Approve the plan, sendBack: [plan] }
  - { id: write, kind: agent, label: Write and export, agent: doc-writer }
  - id: verify
    kind: check
    label: Verify the exports
    commands: [[pnpm, doc:export, --verify, docs]]
    loopBack: { to: write, limit: 2, stopOnSameFailure: true }
  - { id: final, kind: gate, label: Approve the change, sendBack: [write] }
  - { id: ship, kind: ship, label: Ship, auto: false }
```

Here `doc-writer` is a `change` agent with `preset: edit-code` and `tools: [doc-export]`.

### Flow files

A flow file is YAML with `id`, `name`, `description`, and `steps` (one or more).

```yaml
id: docs-only
name: Docs only
description: Plan, change the docs, check, and ship a draft PR.
steps:
  - { id: plan, kind: agent, label: Plan, agent: planner }
  - { id: approve, kind: gate, label: Approve the plan, sendBack: [plan] }
  - { id: write, kind: agent, label: Write, agent: builder }
  - id: verify
    kind: check
    label: Check
    commands: [[pnpm, format:check]]
    loopBack: { to: write, limit: 2, stopOnSameFailure: true }
  - { id: final, kind: gate, label: Approve the change, sendBack: [write] }
  - { id: ship, kind: ship, label: Ship, auto: false }
  - { id: pr, kind: pr-wait, label: Pull request open, maxRounds: 2, backTo: write }
```

Every step has `id`, `kind`, `label`, and an optional `loopBack`.

| Kind      | Fields                    | What happens                                                                                       |
| --------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `agent`   | `agent`                   | The agent with that id runs. Its output kind selects the handler.                                  |
| `gate`    | `sendBack` (default `[]`) | You decide. Approve goes forward. Feedback sends the work to one of the `sendBack` steps.          |
| `check`   | `commands`                | `loop` or `ship` (the `checks.loop` or `checks.ship` set of the config), or a list of argv arrays. |
| `ship`    | `auto` (default `false`)  | The engine commits, pushes, and opens the draft PR. See "Ship".                                    |
| `pr-wait` | `maxRounds`, `backTo`     | The draft PR is open. PR feedback sends the work to `backTo`, at most `maxRounds` times.           |

- `loopBack: { to, limit, stopOnSameFailure? }` sends the work back to an earlier step by
  itself when the step does not pass: a failed check, or a review that asks for changes.
  `limit` is the budget. `stopOnSameFailure` stops at once when the same check failure repeats.
  At the limit, or without a `loopBack`, the issue goes to `needs-you`. Your input (an approval,
  feedback, or `continue`) resets every loop budget.
- Your input never resets the PR rounds of `maxRounds`.
- A flow is one path in order, with loop-backs. Two steps never run at the same time.
- The desk creates the worktree (`setup`) before the first step. `setup` is not a step.
  `intake`, `needs-you`, `shipped`, `cancelled`, and `finished` stay engine states.
- A flow without a ship step ends at `finished` after its last step moves forward: an agent
  step is done, a check passes, a review approves, or you approve a gate. Nothing ships.
  `finished` is terminal, like `shipped` and `cancelled`: no action drives the issue again, and
  `remove` cleans it up. The history records `flow-finished`. A flow with a ship step never
  ends at `finished`.
- The built-in `kaine-default` flow takes its limits from the config (`maxTestLoops`,
  `maxReviewLoops`, `maxPrRounds`). Every other flow carries its own.

### Validation

`validateFlow` (`src/contracts/flow-definition.validate.ts`) runs in the engine and in the
browser. Every rule reports. Nothing stops at the first error.

- The flow id and each step id are valid ids. A step id is used once and is not an engine state.
- `loopBack.to`, `sendBack`, and `backTo` name an earlier step. `loopBack.limit` is 1 or more.
- An agent step names an agent that exists. An intake agent cannot be a step.
- A `pr-wait` step comes directly after the ship step.
- A flow has at least one agent step and at most one ship step.
- The ship step has a plan agent step before it. Ship writes the PR summary and the changeset
  from `plan.json`.
- The ship step comes after a check step that follows the last change agent.

A save, and every start, adds one rule: a ship step that is not `auto` comes directly after a
gate, where you confirm it. `validateAgent` checks the id, the preset, and the tools: a `change`
agent needs `edit-code`, only a `change` agent can use it, and each tool is in `AGENT_TOOLS` and
needs `edit-code`.

### Choose a flow

`start` picks the flow of a new issue in this order:

1. `start --flow ID`, `flowId` in the API, or the flow that you select in the Start dialog.
2. The flow of the first issue label that `flowLabels` lists.
3. `defaultFlow` of the config (default `kaine-default`).

An unknown flow, or a flow that does not validate, refuses the start and keeps no state.
`GET /api/flows` names the configured default as `defaultFlow`.

### Flow snapshots

At Start the desk freezes the flow and every agent that it names into a **flow snapshot**, with
a sha256 hash. The snapshot goes into the issue state, and the issue runs on it until the end. A
later edit of a definition file reaches only the issues that start after the edit. The issue
header shows the flow name and the short hash. The `desk` part of the harness fingerprint
includes the snapshot hash, so `stats --by-harness` shows a changed prompt.

### Save, promote, and delete

- **Save** writes a local file in `.ai.local/desk/`. A local file can take a built-in or repo
  id. It then overrides that definition for you only. The server validates first, and it writes
  nothing when a rule fails.
- **Clone** copies any definition to a new local id.
- **Promote** copies a local file to `.desk/agents/` or `.desk/flows/` and deletes the local
  copy. It asks first, and again before it overwrites a repo file. The desk never stages or
  commits the file. Review it and commit it like code.
- **Delete** removes a local file only. The desk cannot delete a built-in or repo definition. It
  refuses to delete an agent that a flow uses, and it names those flows.

The routes are in [agent-desk-api.md](agent-desk-api.md) ("Agents and flows").

### Ship authorization

A ship needs your approval at a gate of the flow. In the default flow, that is the plan approval
at `plan-gate`. An approval at any gate counts, except at the gate right before the ship. In a
flow whose only gate is the gate before the ship, your confirmation there is the approval.

An automatic ship (`auto: true`) needs no approval and no confirmation. It opens a draft PR only,
and every technical guard of the ship gate still applies (see "Automatic ship"). You merge every
PR.

### State version 2

`state.json` has `schemaVersion: 2`. It holds the flow snapshot, the loop counts by step id, and
the agent sessions by agent id. The desk reads a version 1 file and migrates it onto the built-in
`kaine-default` flow. The old stage names are its step ids, so the old counters and sessions
keep their meaning. The next normal write stores version 2.

## Pipeline engine

`createPipelineRunner(deps)` in `src/engine/pipeline.runner.ts` drives an issue. Every
stage change goes through the pure `transition()` machine. A stage handler does the
side effects and reports an outcome. Only the runner applies it. The runner writes
`state.json`, appends to `events.jsonl`, sets labels and the status comment, and calls
`notify` at a gate or a stop.

| Call                                  | What it does                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `start(n, {override, snapshotFile?})` | Run intake, then drive to the next stop. Run it again to retry intake.                                                 |
| `advance(n)`                          | Drive from the current stage to a gate, `needs-you`, or the end.                                                       |
| `approvePlan(n)`                      | At a gate: approve, then drive. At a gate after a plan step, also rename the branch if the planner chose another name. |
| `feedback(n, target, text)`           | Send feedback to a step of the flow (from a gate, one of its `sendBack` steps). Then drive.                            |
| `continueFrom(n, stage?)`             | From `needs-you`, retry the recorded stage. Never automatic. Then drive.                                               |
| `cancel(n)`                           | Stop the running agent, end the issue. The worktree stays.                                                             |
| `remove(n, {force, keepWorktree})`    | Delete the state and the worktree. It refuses a dirty worktree. The branch stays.                                      |
| `status(n?)`                          | Read one issue or all. It also returns the `needs-you` reason.                                                         |
| `ship(n, {confirm, dryRun?})`         | From `pr-review`: commit, push, draft PR. A dry run changes no state. See "Ship".                                      |
| `refreshPr(n)`                        | At `pr-open`: read the PR once. Merged: `shipped`. Closed: `cancelled`. See "Open PR".                                 |
| `feedbackFromPr(n, {text?})`          | At `pr-open`: send the PR feedback to `build`, then drive. See "PR feedback".                                          |

Each call returns `stopped` (`gate`, `needs-you`, `shipped`, `cancelled`, `finished`, with a
message) or `refused` (a typed `refusal` such as `leased`, `invalid-transition`,
`ship-refused`, and a reason). A refusal changes nothing. A ship dry run returns
`dry-run` with the ship plan.

### Stages

The table shows the stages of the built-in `kaine-default` flow. Another flow has its own steps
(see "Flow files"). `intake`, `setup`, `needs-you`, `shipped`, `cancelled`, and `finished` are
the same in every flow.

| Stage       | Who      | What happens                                                                                                                                                                              |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `intake`    | engine   | Read the issue, prove authorization, write `ticket.md` and `issue.json`.                                                                                                                  |
| `setup`     | engine   | Pick the provisional branch (`fix` for a `bug` label, else `feat`). Run the worktree recipe. Record branch, worktree, base branch, and base commit.                                       |
| `plan`      | planner  | Read-only. Result: `plan.json` and `plan.md`. Open questions show at the gate.                                                                                                            |
| `plan-gate` | you      | Approve, or send feedback. Feedback resumes the planner session.                                                                                                                          |
| `build`     | builder  | Resumed session. Gets the plan, feedback, the last check failure, or the last blocking review findings.                                                                                   |
| `check`     | engine   | `pnpm generate`, drift check, then the configured loop checks. One check runs at a time.                                                                                                  |
| `review`    | reviewer | Fresh, read-only session. Starts only when `check-report.json` passed for the current diff. Reads `diff.patch` and the check results. Default provider is the other one than the builder. |
| `pr-review` | you      | Feedback goes to `build`, `review`, or `plan`. Then `ship`.                                                                                                                               |
| `ship`      | engine   | Commit, push, and open the draft PR. See "Ship".                                                                                                                                          |
| `pr-open`   | you      | The draft PR is on GitHub. You merge it there and run `refresh`, or send its feedback back to `build`. See "Open PR".                                                                     |
| `shipped`   | nobody   | The end: the desk saw the PR merged when you ran `refresh`.                                                                                                                               |
| `needs-you` | you      | A stop that the engine does not retry, or a retry limit reached (see below), lands here with a reason and a `resumeStage`.                                                                |

A check failure goes back to `build` up to `maxTestLoops` times. The same failure twice in
a row stops early. A review with blocking findings goes back to `build` up to
`maxReviewLoops` times. After the limit the issue goes to `needs-you`. In another flow, each
step's `loopBack` sets these limits.

### Invariants

`runAgentStage` (`pipeline.agent.ts`) is the only place an agent runs. Around every
agent stage it checks these rules, whether the run succeeded or not:

- HEAD, the branch, every ref, each remote, and the stash are the same after the run. One
  exception: another local branch that moved to the commit of its remote-tracking branch. An IDE
  or Git client that fast-forwards every branch in the background does this. The run's own
  branch has no exception.
- A read-only agent (every output kind except `change`) leaves the worktree diff hash unchanged.
- The run shows its skill evidence: a `Skill` call, or a read of `SKILL.md`.
- No forbidden command, no permission denial, no claimed check that did not run.
- A change agent changed only files that the plan lists (or generated GraphQL output),
  and no protected path.
- The result passes the contract schema. The runner parses it, and the engine parses it again.

While the agent runs, the engine also watches its tool calls. When the same call (tool, command,
and paths) fails 8 times in a row, the engine stops the run and does not wait for the time limit.
The stage goes to `needs-you`, and the reason names the command. A call that the permission rules
denied does not count. A success or a different call starts the count again.

A violation moves the issue to `needs-you` with every violation in the reason. The
worktree stays as the agent left it. The agent session is not kept.

When all rules hold, the engine records the **refs baseline** (`refs-baseline.json`): HEAD,
the branch, every ref, each remote, and the stash. It does this after every agent stage.
The ship gate compares the worktree with the latest baseline. Without a baseline the gate
fails closed (`refs-baseline-missing`).

### Ship

`ship` is the only step that commits, pushes, or opens a PR. The engine does it, never an
agent. It runs only from the gate before the ship step (`pr-review` in the default flow), only
with your explicit yes. A flow can mark its ship step `auto: true` instead (see "Automatic
ship" below).

- `ship <n> --dry-run`: write `ship-plan.json`, `pr-body.md`, and `commit-message.txt` in the
  artifacts folder, print the plan, and change nothing. The plan shows the gate verdict, the
  files, the PR title, the changeset decision, and the path of `pr-body.md`. Exit 1 when the
  gate would refuse.
- `ship <n> --confirm`: ship now.
- `ship <n>` without a flag: on a terminal it asks `Ship #n as a draft PR? [y/N]`. Without a
  terminal it refuses with exit 1.
- `--dry-run` and `--confirm` do not go together.
- An issue that writes nothing to GitHub (`--no-writeback` or a snapshot file) cannot ship: a
  push and a PR are writes too. `ship --confirm` refuses (`ship-refused`) and changes nothing.
  `--dry-run` still works.

The gate must pass first. Every rule must hold, and a refusal lists all failed rules and
changes nothing: you confirmed; the check report passed and matches the diff; `gh` is signed
in as the owner; the branch name is valid; the authorization snapshot still holds (it reads
the issue again); the refs match the baseline; no protected path is in the diff; the owner
approved at a gate of the flow (`owner-not-approved`); the reviewer approved the same code. A
snapshot-file issue fails the authorization check, because the real issue differs.

The owner's approval comes from the issue's flow snapshot and history: a `plan-approved` or
`gate-approved` event at a gate of the flow other than the gate before the ship. In the default
flow that is the plan approval at `plan-gate`. A flow whose only gate is the gate before the
ship has no other approval: your confirmation there is it. An automatic ship needs none.

After the gate, the engine enters the `ship` stage and runs: the ship checks (`pnpm check`),
the changeset file or the `release:skip-changeset` label, a commit through the repository
hooks, a rebase onto `origin/<base branch>` if needed (with the checks again), a push of the
branch, and `gh pr create --draft`. It sets the label `agent:pr-open` and edits the status comment
with the PR link. The issue moves to `pr-open`.

The ship of a PR feedback round is an update of the open PR, not a new one:

- No fetch and no rebase. The commit goes on top of the pushed head, so the reviewers see one
  new commit. Its header is `fix: address PR feedback (round <n>)`.
- A plain `git push -u origin <branch>` to the same branch. Never a forced push. A branch that
  has a commit the desk does not know rejects the push (`push-rejected`).
- No `gh pr create` and no edit of the PR title or text. The open PR for the branch must be the
  PR on record, or the ship stops with `pr-changed`.
- No second changeset: the diff already holds the file of the first ship.
- The gate reads the PR with `gh pr view` before any change and again right before the push.
  It refuses, with the remote untouched, when the read fails (`pr-unavailable`), the PR is not
  open (`pr-not-open`), its head is not the head the desk pushed or read (`pr-head-moved`), or
  it is on another branch (`pr-mismatch`). A ship that resumes after its push went through
  accepts its own commit as the head and does not push again.
- Success records `pr-updated` (the first ship records `pr-opened`), sets `prHeadSha` to the new
  commit, and moves the issue back to `pr-open`.

Safety rules:

- The PR is always a draft against the base branch that setup recorded (`main` by default).
  The desk never merges, approves, enables auto-merge, or marks the PR ready. You review it and merge it yourself on GitHub.
- No `--no-verify`, no force push, no `--amend`. The hooks run. Commit and PR text pass the
  AI-attribution check.
- The commit holds exactly the files of the diff (plus the changeset file). Protected paths
  stop the ship.

A failure after the first change (a hook refuses, a push is rejected, a rebase conflicts)
moves the issue to `needs-you` with `resumeStage: ship`. The reason has the failure and the
redacted tail of the output. Fix the cause, then run `pnpm desk continue <n>`. The ship
continues where it stopped: it makes no second commit and no second PR. `continue` retries a
ship only if you confirmed it before, or if it is automatic. A new `ship --confirm` is not
valid there.

#### Automatic ship

A flow step `{ kind: ship, auto: true }` ships without your confirmation. The default flow
keeps `auto: false`.

- The issue moves into the ship step by itself: after the step before it, or after your
  approval at a gate before it. No `ship-confirmed` event is written; the history records
  `ship-automatic` instead.
- Every rule of the gate applies, except your confirmation. A refusal (for example a check
  report that does not match the diff) moves the issue to `needs-you` with `resumeStage: ship`
  and changes nothing on GitHub. `continue` retries it.
- The PR is a draft, as always. The desk never merges and never marks it ready.
- An issue that writes nothing to GitHub stops at `needs-you` instead of shipping.

### Open PR

At `pr-open` the draft PR is on GitHub and the desk waits for you. Nothing runs. Review the
PR, mark it ready, and merge it yourself on GitHub. Then run `pnpm desk refresh <n>` (or
**Check the PR** in the UI). It reads the PR once with `gh pr view`:

- Merged: the issue ends at `shipped`. The desk removes its `agent:pr-open` label and adds no
  other.
- Closed without a merge: the issue ends at `cancelled`.
- Still open: nothing changes. The command prints the PR link.

`refresh` refuses (`refresh-refused`) and changes nothing when the issue writes nothing to
GitHub (`--no-writeback` or a snapshot file), when it has no PR number, or when the GitHub read
fails. Outside `pr-open` it refuses with `invalid-transition`.

`shipped` means one thing: the desk saw the PR merged during a `refresh` that you ran. The desk
never polls the state of an issue's PR. (The server's once-a-minute `gh` query only refreshes the
repository-wide **Open pull requests** list in the UI. It moves no issue.) At `pr-open`, as everywhere, it never merges, approves, marks the PR
ready, enables auto-merge, or force-pushes.

The issue state counts PR feedback rounds (`prRounds`). `maxPrRounds` in the config (default 3)
is their limit. The status comment shows `PR rounds: n of max` while the issue is at `pr-open`.

### PR feedback

`pnpm desk feedback <n> --from-pr [text]` (or `--file <path>`; **Send PR feedback** in the UI)
sends what the open PR says back to `build`. Your own text is optional. It does not go with
`--to`. The desk reads, with read-only `gh` calls:

- the reviews and the inline review comments on the PR head commit;
- the conversation comments made after the last `pr-opened` or `pr-updated` event;
- the check runs of the PR head that end in `failure`, `timed_out`, `cancelled`, or
  `action_required`, and for a failed GitHub Actions run the tail of `gh run view --log-failed`.

Trust rules: only text whose `author_association` is `OWNER`, `MEMBER`, or `COLLABORATOR`
reaches the builder. A review bot such as CodeRabbit is a GitHub App, and GitHub gives it the
association `NONE`. To let its comments through, list its exact login in `reviewBots` in
`.ai.local/desk/config.json`, for example `"reviewBots": ["coderabbitai[bot]"]`. The login must
end in `[bot]`, and GitHub must report the account as a bot. The desk names every author it
left out in the event note and in a refusal. Reviews and inline comments on an older commit are
left out. All PR text is third-party data: the desk redacts
token-like strings, cuts each log to its last 6 KB, each comment to its first 2 KB (after it drops HTML comments and folds `<details>` blocks to their summary, where review bots put long analysis ahead of the finding), and the
whole to 24 KB (every cut is marked), and wraps it in the untrusted-data fence. A fence marker
inside a comment is removed, so a comment cannot close the fence. Your own text goes first,
outside the fence, as the owner's note.

Head binding: the PR head must be the worktree HEAD, and the worktree must be clean. The
builder then works on exactly the code the reviewers saw.

On success the desk writes `pr-feedback.json` (the selected items, the head, and the time),
adds the text to `feedback.md`, renames `ship-record.json` to `ship-record.round-<n>.json`
(so the next ship starts clean), counts a round, and runs `build`, `check`, and `review` to
`pr-review`. Ship again from there: see "Ship" for the update ship.

It refuses with `pr-refused` and changes nothing when the issue writes nothing to GitHub
(`--no-writeback` or a snapshot file), it has no PR number or no worktree, the PR read fails,
the PR is not open, the PR head is not the worktree HEAD, the worktree has uncommitted
changes, the feedback read fails, or there is no failing check, no trusted comment, and no
text of yours. Outside `pr-open` it refuses with `invalid-transition`. At the round limit it
reads nothing from GitHub: the issue goes to `needs-you` with the reason `pr-round-limit` and
keeps `pr-open` as its resume stage, so `continue` returns there.

### Why these checks exist

These facts come from real runs (claude 2.1.282, codex-cli 0.147.0).

- A deny prefix can be bypassed. With `Bash(git:*)` allowed and `Bash(git commit:*)`
  denied, both `git -C . commit` and `git -c k=v commit` ran. The allowlist therefore
  names only read-only git subcommands. A narrow allowlist denied those forms. Deny rules
  stay as a second layer. The HEAD and ref check is the layer that cannot be bypassed.
- An allow rule does not restrict the `Skill` tool. Only a deny rule does. The desk
  denies every skill outside the agent's list by name.
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
(the review and the findings the engine rejected), `report-<agent>.json` for a report agent,
`agent-<agent>.json` (session, usage, denials, tool calls), `receipts-<agent>.jsonl`, and
`run-settings-<agent>.json`. `<agent>` is the agent id; the intake draft uses its role name.
A draft adds `issue-draft.json` and `intake-fit.json`. Ship adds `refs-baseline.json`,
`ship-plan.json`, `pr-body.md`, `commit-message.txt`, `ship-record.json` (what the ship did so
far), and `ship/check-report.json`. A PR feedback round adds `pr-feedback.json` and keeps the
earlier ship record as `ship-record.round-<n>.json`.

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
5. Write `artifacts/ticket.md`. When the latest draft scored this body (see "Fit score"), and its
   confidence is 1, log the warning and record `fit-warning`. The run goes on.
6. Move the issue to `setup` with status `waiting`.

Intake reads the issue by the headings of [`issue-format.md`](issue-format.md). It needs at
least one acceptance criterion. Without one, the issue goes to `needs-you` with the reason.
Fix the issue on GitHub (the `kaine-write-issue` skill writes the format, and
`pnpm desk contract <n>` shows how intake reads it), or let the desk draft it (below). Then run
`desk start` again. In the desk UI the card says **Fix and start again**, and the issue page
offers **Start again** with the override box, because intake cannot continue: it reads the issue
again. A closed issue also goes to `needs-you`. The board shows the title of a stopped issue too.
After a successful intake, `start` goes on to setup and the planner.

### Draft the issue format

For an issue that stopped at intake, `pnpm desk draft <n>` asks the read-only `intake` agent
(skills `kaine-intake` and `kaine-write-issue`) to sort the author's facts into the six sections.
It runs in the main checkout, because no worktree exists before setup, under the same invariants
as every agent stage, and it records no refs baseline. The engine renders the body from the
sections and adds the old body as a quote under `## Original text`, so no fact is lost and no old
heading counts. A section the facts do not support says `unknown, investigate first`, with the
question. The draft goes to `artifacts/issue-draft.json` with the agent's recommendation. The
issue stays at `needs-you`. `providers.intake` and `models.intake` choose the agent.

`pnpm desk draft <n> --apply` replaces the issue body on GitHub with the draft. It asks first on a
terminal; `--confirm` is the yes without a terminal. Every rule must hold, and a refusal
(`draft-refused`) changes nothing:

- you confirmed;
- a draft exists, and it still reads as a full contract;
- the issue writes to GitHub (no `--no-writeback`, no snapshot file);
- `gh` is signed in as the owner;
- the issue is open, and its body on GitHub is still the one the draft started from. When someone
  edited it in the meantime, draft again.

The body goes to `gh issue edit --body-file -` through stdin. Then the draft is deleted, the
history records `draft-applied`, and the issue waits for `start`. The desk still never adds
`ready-for-agent`. A new draft deletes the old one first, so a failed redraft leaves none to
apply. The desk UI offers the same steps on the issue page.

### Fit score

The draft also grades how well the issue suits an unattended agent run. The agent gives each axis
a grade from 1 to 3 with a one-line reason, and 3 is the best fit on every axis:

| Axis          | 3                                            | 1                                                             |
| ------------- | -------------------------------------------- | ------------------------------------------------------------- |
| Clarity       | One reading only.                            | Two reasonable readings give different code.                  |
| Complexity    | Low: a bounded change in one workspace.      | High: cross-cutting, a migration, or an unknown blast radius. |
| Verifiability | Every criterion maps to a command or a test. | The result needs a person's judgment.                         |

The engine takes the lowest grade as the confidence. No agent supplies it. `draft` prints the
grades, and the desk UI shows them in the draft. The score goes to `artifacts/intake-fit.json`
with the hash of the body the draft started from and of the drafted body. Applying the draft keeps
this file. When `start` reads one of these two bodies and the confidence is 1, it logs a warning
and records `fit-warning`, and the run goes on. A changed body makes the score stale: `start` then
ignores it. The score is advice. It never blocks `start` and never changes a label: you decided
readiness when you applied `ready-for-agent`.

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
config file, and the `claude` and `codex` CLIs. Under a failed check it prints the command that
repairs it (`run: gh auth login`). It reads `claude --help` and
`codex exec --help` and checks that each required flag exists. A missing provider
that a role uses is an error. A provider that no role uses is a warning.

It also checks Docker: the daemon, the worker image, and the provider logins. With
`isolation: "host"` a missing daemon or image is a warning. With `isolation: "docker"` it is an
error. `desk doctor --probe` and `desk docker doctor` also run the isolation probes.

It checks the repository too. Both rows are warnings, and the UI offers a **Fix** button for each:

- **Agent labels**: the `agent:*` execution labels exist on GitHub. The fix is
  `pnpm desk labels sync --apply`.
- **Workspace builds**: each workspace whose `main`, `types` or `exports` points into `dist/` has a
  `dist` folder in this checkout. The fix is the printed `pnpm turbo run build --filter=...`
  command.

On a Windows host it adds two rows:

- **Codex sandbox**: `codex sandbox` reads `package.json` in the same sandbox that the Codex runner
  uses. No model runs. A failure is an error when a role uses Codex. See "Codex on a Windows host".
- **Worktree path**: the issue worktree folder, the longest package folder in
  `node_modules/.pnpm`, and a nested `cjs/package.json` must stay below 260 characters. At 260
  characters Node cannot read that `package.json` and loads a CommonJS file as an ES module.

## Config

Optional file: `.ai.local/desk/config.json` (gitignored). Without it, the desk uses
defaults. A file that exists but is invalid is an error. Fields are listed in
`tooling/desk/src/contracts/desk-config.contract.ts`.

- On a Windows host the default `isolation` is `docker` (see "Docker isolation"). Set
  `"isolation": "host"` to keep host mode.
- Issue worktrees go in `<main checkout>.worktrees/KAINE-<n>`, next to the main checkout. This is
  also true when the desk runs from a linked worktree. Set `worktreesDir` to use another folder.
- `baseBranch` (default `main`) is the branch on `origin` that issue worktrees start from and
  that PRs target. Setup records it in the issue state. A later change of the config does not
  move an issue that went through setup: its ship fetches, rebases onto, and targets the recorded
  branch. The loop check `pnpm check:affected` compares with `origin/main`; set `checks.loop`
  when your base is another branch.
- `defaultFlow` (default `kaine-default`) is the flow a new issue runs on when you name none
  and no label picks one.
- `flowLabels` maps a GitHub label to a flow id, for example
  `"flowLabels": { "docs": "docs-only" }`. At `start` the first label of the issue that the map
  lists picks the flow. `start --flow` (or `flowId` in the API) overrides both. The Start
  dialog shows the pick for each open issue (`flowId` in `GET /api/github`).

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
port. It prints `Agent desk: http://127.0.0.1:<port>/`. Open that URL, or
`http://localhost:<port>/`, in any local browser. The built UI grants that browser a
session cookie. The printed Vite dev link contains a one-use token for the separate
development origin. `--no-open` does not open a browser. Every `/api/*` route except
the token exchange needs the cookie, so a request without it gets `401`. Ctrl-C closes
the server and exits 0. A running action is not cancelled: the next start marks it
`needs-you`. See [`agent-desk-api.md`](agent-desk-api.md).

`pnpm desk:run [--port N] [--no-open]` builds the UI, then runs `pnpm desk serve` with the
same options. Use it to start the desk with one command and a fresh UI build.

When the port of `--port N` is taken, `serve` says whether another desk server holds it. On Windows,
stopping `pnpm desk:run` can leave its node process serving the port. Open its URL, or find its
pid with `netstat -ano | findstr :N` and stop it.

The server serves the built UI from `tooling/desk-ui/dist`. When that folder has no
`index.html`, `serve` builds it first with `pnpm --filter @repo/desk-ui build` and says so.
If the build fails, the server still starts with the API only and prints the end of the
build output.

## The desk UI

`tooling/desk-ui` (`@repo/desk-ui`) is the React front end of the same engine. It is local
developer tooling. It has six views: **Board**, **Issue**, **Flows**, **Agents**, **Health**, and
**Runs**.

- **Board.** The board opens on **Your turn**: the issues that wait on you, and nothing else.
  - _Needs you_ comes first (stopped issues, with the engine's reason), then _Your decisions_
    (issues at a gate, oldest first). The first row is **Next up** and holds the one primary
    button. A plan the planner graded high risk has a chip that says so. A low-risk plan has a
    quick **Approve** on its row; with two or more of them, **Approve N low-risk plans…** asks
    first and lists the plans. A card has the progress bar of its flow, one segment for each node
    of the issue's own flow, and its name says the stage in words ("Stage 4 of 9: Build
    (Running)"). A row or card names the flow ("Flow: Quick fix") only when it is not the
    built-in default.
  - A side list shows the running issues (a paused issue says so), the open pull requests of the
    repository (read-only: number, title, draft, branch, author), and the done issues, folded.
    The desk does not continue a pull request; you review and merge on GitHub.
  - **Columns** is the kanban: _Needs you_, _Waiting for you_, _Running_, and _Done_, with filter
    chips. The board keeps your choice of layout in the browser. The search filters both layouts
    by number (with or without `#`) or by words of the title.
  - **Start issue** opens a dialog with the open issues of the repository (`GET /api/github`),
    the number, the flow, and the `override` box. Each issue shows whether it carries
    `ready-for-agent` and its contract count. Picking an issue fills the number and selects the
    flow the desk picks for it (its label rule, else the default flow), marked "Default for this
    issue". The flow list (`GET /api/flows`) shows each valid flow with its source (built-in,
    repository, or local); the start sends the chosen `flowId`. Without a choice the desk picks.
    The dialog never checks the override box for you. A refusal keeps the dialog open.
  - `tooling/desk-ui/src/status/status.model.ts` is the one mapping from a summary to the board
    group, the tone, the chip words, the gate mode, and the next action. Every view reads it.
    The gate mode follows the step kind in the issue's own flow: a gate right after a plan agent
    is the plan approval, a gate right before a ship the owner confirms is the review and ship,
    and any other gate approves or sends back. Stage names come from the flow: a built-in step
    has translated words, and a step the owner wrote shows its own label as it is.
- **Issue.** A short header, the decision, then the history.
  - The header has the way back, the place of the issue in Your turn (**J** and **K** go to the
    next and the previous decision), the number and title, and a **More** menu (Cancel run,
    Show graph, Copy branch name, Open on GitHub, Remove). Below it is one status line (the
    chip, the time in the stage, the flow as "name · short hash" with its source and its steps
    on hover or focus, the cost) and the stages of the issue's flow as a compact stepper.
  - **Show graph** shows the React Flow graph of the flow model. It is read-only, and it fits
    itself on the first size and on a resize only. A phone has the stepper only.
  - A stage of the stepper or the graph opens the **stage side sheet**. The sheet is not modal:
    the page stays usable. It shows who works in the stage, its status, its tiles (for an agent
    stage, the agent usage of all runs), its checklists, what went wrong, and the full result.
    An agent stage also lists **Capabilities**: for each run, the receipt of what it got. That
    is the provider and model, the tool set, where it ran (isolated in a container, or on your
    machine under the Claude allowlist or the Codex sandbox), the network, the MCP servers and
    skills, the allowed and denied tool rules (counted, listed on request), what it asked for
    and did not get with the reason, and the engine's notes. A run from before the receipt
    says so.
    **←** and **→** step through the stages, **Esc** closes it, and focus returns to its opener.
    On a phone the sheet covers the screen.
  - The decision card follows the gate mode. At the plan gate: the plan risk and its reasons,
    the track record of that risk, the revision note of a later round, **Approve plan** (**A**;
    an optional note and the answer to the planner's question go with it), and **Request
    changes**. At PR review: the files ordered by risk, with viewed progress. **Ship as draft
    PR…** (**S**) stays secondary until you viewed every file; **N** opens the next file not
    viewed. The ship dialog runs the dry run first, then asks for the final yes. Only that yes
    sends `confirm: true`. At any other gate of a flow: **Approve** (**A**) and **Request
    changes**, which sends the work back to one of the steps the gate names, by label. When the
    desk needs you: an incident card with the engine's reason, a jump to the failure in the
    trace, **Resume from** (the stages of the issue's flow that the server restarts), and
    **Continue** (**C**). While an agent
    runs: **Pause** (**P**) stops the issue after its current stage, and **Resume** continues it.
    After a stop at intake: **Draft the issue format**, the review of the draft, and **Apply to
    GitHub…**, which asks a second time. On a phone the decision's buttons are a bar fixed to the
    bottom of the screen.
  - **History** has the **Trace**: one row per stage and round on one time axis, with a bar, the
    duration, the agent cost, the outcome, and its log lines. Filters show the problems or the
    agent steps only. A link shows every raw event. The live **Log** has a local `<time>` per
    row. The card opens by itself when the issue runs, needs you, or is in intake.
- **Flows.** The flows the desk can run an issue on (`GET /api/flows`).
  - Each row has the name, the id, the source badge, "Overrides ..." when it overrides a lower
    source, **Read-only** for a built-in flow, the number of problems, and **Default** for the
    flow that `defaultFlow` of the config names. Below are the step kinds in order and the number of
    active issues on the flow. **Open** opens the editor; **Clone** makes a local copy. Files
    that do not load show at the top with their errors.
  - **New flow** starts as a copy of the built-in flow, because an empty flow is not valid.
  - The editor shows one draft in two forms: a list of the steps and a graph (React Flow). An
    edit in one shows in the other at once. Each step in the list has the form of its kind: the
    agent (intake agents are not listed), the `sendBack` steps, the command set or your own
    commands (one per line; no shell runs them), the automatic ship box with its warning, the PR
    rounds and `backTo`, and the loop back with its limit.
  - The rules of "Validation" run as you type. Each problem shows under its step and on its
    card. **Save** stays off while a rule fails, and its description says why. A refused save
    puts each problem of the server under its step.
  - Every graph action has a keyboard way. In the list, **Up**, **Down**, **Add a step after**,
    and **Remove** buttons, and **Alt+↑** and **Alt+↓** move the step that you are in. On the
    graph, **Enter** on a card edits the step in the list, **←** and **→** move it, and
    **Delete** on an edge removes it. With a pointer you can drag a card sideways to move its
    step, drag from the dot on top of a card to an earlier card to make a loop back, send-back,
    or PR feedback edge, and drag a step kind from the palette onto the graph. A palette button
    adds the step after the selected one.
  - A built-in flow opens read-only with **Clone to edit**. A repository flow has **Edit
    locally**; its save asks first, because it writes a local override. A local flow has
    **Save**, **Promote…**, and **Delete…**. Promote asks first and names the file; after it, the
    page says the file is uncommitted. **Start an issue on this flow…** opens the Start dialog
    with the flow selected. Leaving with unsaved changes asks first.
- **Agents.** The agents the desk can run (`GET /api/agents`).
  - A search (name, id, or description) and filters by source and by output narrow the list.
    Each row has the name, the id, the output, the provider, the source badges, the tool set,
    and the number of MCP servers and skills it asks for. **Open** and **Clone** work as on
    Flows. **New agent** opens an empty editor.
  - The editor has the fields of "Agent files" and the prompt. A tool set that the output does
    not allow is off, with the reason. A server or skill that the checkout does not have says
    "Not installed". **What a run gets** shows the profile that the server resolved with the
    config of the desk now; before a save it shows only what the agent asks for.
  - Clone, Edit locally, Save, Promote, and Delete work as on Flows. Delete refuses an agent
    that a flow uses and lists those flows.
- **Health.** The doctor report.
  - A summary chip (Ready or Problems found), the time of the check, and **Setup X of Y ready**
    with a progress bar. While errors remain, a line says to fix them first: they stop a run.
  - Each check has its status in words, its label, and the engine's detail. A failed check shows
    the command that repairs it, with **Copy**: a login or an install stays with you. When the
    desk has its own repair (build the Docker image, create the agent labels, build the workspace
    packages), **Fix** asks first, then the engine runs that fixed command. No agent runs, one
    repair runs at a time, and the report runs again when it ends. A toast says how it ended.
  - **Check again** runs the doctor again. Placeholder lines show while it runs.
- **Runs.** `GET /api/stats` and `GET /api/lessons`.
  - **Today** is one line from the last day of `days`: agent runs, shipped issues, and the cost,
    with the issues that need you or wait for you now.
  - **Last 7 days** has three cards: agent runs, cost, and shipped issues. Each card has the
    total, a line of the seven days, and today's value. The line is decorative; a text for a
    screen reader gives each day's value. A day without a reported cost reads "none", not zero.
  - **By agent and model** has one row per agent, provider, and model: a built-in agent reads as
    its role, an agent of the owner's own by its id. A run recorded before agents were data counts
    for the built-in agent of its role. **By issue** has one row per issue (a removed issue says
    so). **Cost by agent** shows the total cost of each agent as a bar,
    with the value beside it. A value that no run reports shows a dash read as "none". Wide
    tables scroll inside their card. **Load again** reloads; placeholder lines show while it
    loads. The view also reloads, without placeholders, when an issue changes.
  - **Lesson candidates** lists each problem seen in two or more issues: its source, its rank,
    links to the issues, the times it was seen in all and under the current instructions, and up
    to three samples as plain text (see "Lessons"). **How lessons are ranked** explains the rank:
    _High_ (seen in 4 or more issues and still seen now), _Medium_ (fewer issues), and _Low_
    (seen only under older instructions; check it first).
  - **Promote…** marks a lesson handled, with an optional note. It leaves the candidates and
    shows under **Promoted lessons** with its time, its note, and its GitHub issue. **Unpromote**
    makes it a candidate again. **Turn into issue…** loads the preview and shows the exact title
    and body that the desk sends. Only **Open the issue** sends the request, with the digest of
    that preview. The page then links the new issue. A lesson that changed after the preview is
    refused (`409 lesson-refused`) and no issue opens. These are owner actions: they act at once,
    with no undo window. A lessons failure does not hide the run tables.

The shell is the same on every view.

- The top bar is one row at every width: the brand mark, the **Board**, **Flows**, **Agents**,
  **Health**, and **Runs**
  pills (Board has the count of Your turn), the search, one polite "Live"/"Reconnecting" status,
  and a preferences menu. A banner shows while the connection is lost.
- **Ctrl+K** (or **⌘K**) or **/** opens the command palette: actions of this page (for example
  **Check again** on Health and **Load again** on Runs), recent issues, Your turn, the views,
  and every issue. Its footer lists the shortcuts of the page. **G** then **B**, **F**, **A**, **H**, or **R**
  goes to Board, Flows, Agents, Health, or Runs. A single-key shortcut does nothing while you type or while a
  dialog or a menu is open.
- Approve, Request changes, Continue, Cancel run, and Remove wait 8 seconds before they are
  sent. A toast says what will happen and offers **Undo**; Undo sends nothing. A page that closes
  in that time sends the action at once. Cancel and Remove also ask first. A ship and the lesson
  actions have no undo window: the ship asks twice, and the lesson actions act at once.
- The tab title is "(3) Agent Desk" while three issues wait on you. In the preferences you can
  turn on browser notifications: the browser then notifies when an issue newly needs you or
  reaches a gate. Theme (light, dark, or system) and language (English, German, Serbian) switch
  there at once and keep what you typed and where you scrolled.
- A phone (below 40 rem) is for triage: the board shows Your turn only, the issue page shows the
  stepper without the graph, Runs hides the week cards, and touch targets are at least 44 px.
  No view scrolls sideways; a wide table scrolls inside its card.

The page needs no polling. It loads `GET /api/issues` once, opens `GET /api/events`, and
reloads the list after every (re)connect with exponential backoff, so a missed event is not
lost. A `401` tells the engineer to reload the page. Engine text (reasons, logs, tickets,
samples, issue bodies) is shown as text, never as markup. The strings are in the `desk`
namespace of `packages/translation`. Colors, spaces, and fonts are `--ds-*` tokens only,
including the React Flow variables. Bars and lines are SVG attributes, never style attributes,
because the CSP blocks those.

### Dev flow

1. `pnpm desk serve --port 4777 --no-open` in one terminal. It prints the local URL and
   a one-use Vite dev link.
2. `pnpm desk:ui` in another terminal. This starts Vite on `http://localhost:5174` and
   proxies `/api` to `127.0.0.1:4777` (change it with `DESK_API_TARGET`).
3. Open the Vite dev link, but with the Vite address: replace `http://127.0.0.1:4777` with
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

On a Windows host, use Docker mode. It is the default there. In host mode the builder and the
checks run on Windows, and some repository tests (the desk's own, for example) pass only on Linux
and macOS, so the ship check (`pnpm check`) cannot pass. Docker mode runs the builder and every
check on Linux, as CI does. Docker Desktop must be running. On Linux and macOS, host mode is enough
for the checks; Docker mode adds the security boundary.

A check container gets `DATABASE_URL` set to the loopback placeholder that CI uses
(`postgresql://postgres:postgres@127.0.0.1:5432/monorepo_dev`). `pnpm generate` and some tests
import the database client at load time and need a URL. The container has no network, so nothing
connects. No container gets any other `DATABASE_URL`.

Git on Windows ignores the exec bit on disk (`core.fileMode=false`) and keeps it in the index. The
desk writes the exec bits of a container patch into the index, and ship keeps them through its
`git reset` and `git add`. A new executable file from the container therefore shows as staged.

### What runs where

| Step                                                   | Host mode | Docker mode                              |
| ------------------------------------------------------ | --------- | ---------------------------------------- |
| Intake, setup (worktree, `pnpm install`, `ai:install`) | host      | host (trusted code from `origin/<base>`) |
| Planner, reviewer (read-only)                          | host      | host (they run no repository code)       |
| Builder                                                | host      | container                                |
| Check stage (`pnpm generate`, loop checks)             | host      | container, one container per step        |
| Ship checks (`pnpm check` before the commit)           | host      | container, one container per step        |
| Ship (commit, push, PR)                                | host      | host                                     |

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

### Codex on a Windows host

The planner and the reviewer run on the host in both modes. The runner passes
`--ignore-user-config`, so Codex does not read `[windows] sandbox` from `~/.codex/config.toml`. On
Windows the runner adds `-c windows.sandbox="unelevated"`. With the default sandbox Codex refuses
every command. The `elevated` sandbox cannot read the worktree or `.git` (codex-cli 0.154.0).
`desk doctor` checks this sandbox with a token-free probe.

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
- No MCP server in a container: it needs a network or a host tool. Setup installs the MCP
  servers that the flow's agents ask for (Serena and Context7 in the default flow) into the issue
  worktree, so host runs (the planner and the reviewer in both modes) can use them. The Docker builder stays offline on purpose (see "Threat model") and reads the
  installed package types in `node_modules` for library APIs.
- A Codex role gets no MCP server, on the host too: run with the desk's flags
  (`--ignore-user-config`), Codex lists none, although the worktree `.codex/config.toml` lists
  Serena and Context7 (codex-cli 0.154.0). A Claude role gets both.
- No browser or Playwright in the image. Checks that need a browser fail in a container.
- The image is about 2 GB (Node, git, a C toolchain for native modules, Claude Code, Codex).
- Checks run on Linux. A check that passes on macOS can fail in the container, and the other way
  round.
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
