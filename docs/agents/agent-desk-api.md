# Agent desk server API

`createDeskServer` (`tooling/desk/src/server`) serves a local HTTP API, a server-sent
event stream, and a built UI. It is local developer tooling. It is never mounted in
`apps/api`. The manual for the desk is [agent-desk.md](agent-desk.md). The decision is
in [ADR 0011](../adr/0011-local-agent-desk.md).

Wire types live in `@repo/desk/contracts` (`api.contract.ts`, `flow.model.ts`). They
import only Zod, so a browser can use them.

## Start and connect

- `launchDeskServer({ port?, open?, uiDir?, depsFactory?, cwd?, print?, openBrowser?, tuning? })`
  builds the runtime, starts the server, prints the local URL and Vite dev link, and returns
  `{ server, url, launchUrl, close, runtime }`.
- `serveDesk({ ...same options, signal? })` does the same, then waits for SIGINT,
  SIGTERM, or `signal`, then closes. This is what `pnpm desk serve` calls.
- `depsFactory(onEvent)` returns a `DeskRuntime`: `{ runner, store, health, healthFixes?, openWork?, currentDiffHash?, readRuns?, prRoundLimit?, lessons?, lessonActions?, uiDir?, dispose? }`.
  Pass the given `onEvent` to `createPipelineRunner` as `PipelineDeps.onEvent`. The server
  listens to it for live logs and fast updates. Without a factory the server builds the
  real runtime (`createDefaultDeskRuntime`).
- The built UI at `http://127.0.0.1:<port>/` or `http://localhost:<port>/` issues an
  `HttpOnly; SameSite=Strict` cookie on each direct page load. This lets each local
  browser open the plain URL. The separate Vite development origin uses the printed
  launch URL, `http://127.0.0.1:<port>/#session=<token>`. The token stays in the URL
  fragment and is posted to `POST /api/session` once.

## Security rules

- The listener binds to `127.0.0.1` only. The default port is random.
- Every request must carry `Host: 127.0.0.1:<port>` or `localhost:<port>`. Anything else
  gets `403 forbidden` (DNS rebinding).
- An `Origin` header, when present, must be the server's own origin.
  `Sec-Fetch-Site: cross-site` gets `403`.
- A write (`POST`) needs an `Origin` header, the header `x-desk-request: 1`, and
  `Content-Type: application/json`. The body is limited to 64 KiB.
- Every `/api/*` route except `POST /api/session` needs the session cookie
  (`401 unauthorized` without it). Static files need no cookie; the UI entry page
  issues one for the local browser.
- Every response has a strict CSP, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, and `X-Frame-Options: DENY`.
- A client names an artifact by id and an issue by number. It never sends a path.
  Symbolic links and non-files are not served.
- The server returns codes and raw engine text. The UI escapes and translates.

## Routes

| Method | Path                             | Answer                                                                    |
| ------ | -------------------------------- | ------------------------------------------------------------------------- |
| POST   | `/api/session`                   | `{ ok: true }` and the session cookie. Body: `{ token }`. One use.        |
| GET    | `/api/health`                    | `HealthReport` (doctor mirror). Cached for 10 s.                          |
| POST   | `/api/health/fix`                | `{ fix }`. `202` while it runs, `404` unknown to this desk, `409 busy`.   |
| GET    | `/api/github[?refresh=1]`        | `GithubLists`: open issues (with `flowId`) and PRs. Cached 60 s.          |
| GET    | `/api/stats`                     | `RunStats` from `runs.jsonl`: runs by agent, provider, model, and issue.  |
| GET    | `/api/lessons`                   | `LessonReport` from `lessons.jsonl`: problems seen in two or more issues. |
| POST   | `/api/lessons/promote`           | `LessonReport`. Body: `{ key, note? }`. `404` for an unseen key.          |
| POST   | `/api/lessons/unpromote`         | `LessonReport`. Body: `{ key }`. `404` when the key is not promoted.      |
| GET    | `/api/lessons/issue-preview?key` | `LessonIssueDraft`: the exact `{ key, title, body, digest }` to send.     |
| POST   | `/api/lessons/issue`             | `LessonIssueCreated`. Body: `{ key, digest, confirm: true }`. See below.  |
| GET    | `/api/events`                    | Event stream. See "Events".                                               |
| GET    | `/api/issues`                    | `{ issues: IssueSummary[] }`. An unreadable issue has `readable:false`.   |
| GET    | `/api/issues/:n`                 | `IssueDetail` with the issue's `runs`. `404`, `409 unreadable`.           |
| GET    | `/api/issues/:n/artifacts/:id`   | The raw file. `404 not-found` for an id outside the list.                 |
| GET    | `/api/issues/:n/log?after=<seq>` | `{ entries, last }`. The live buffer (500 entries for each issue).        |
| POST   | `/api/issues/:n/actions`         | `ActionRequest`. `200` done, `202` accepted, or an error.                 |
| GET    | `/api/agents`                    | `AgentList`: the registry's agents, resolved. See "Agents and flows".     |
| GET    | `/api/agents/:id`                | `AgentView`. `404 not-found` for an id the registry does not have.        |
| GET    | `/api/flows`                     | `FlowList`: the registry's flows. See "Agents and flows".                 |
| GET    | `/api/flows/:id`                 | `FlowView`. `404 not-found` for an id the registry does not have.         |
| PUT    | `/api/agents/:id`                | `DefinitionWriteResult`. Body: `{ definition }`. Saves to local.          |
| PUT    | `/api/flows/:id`                 | `DefinitionWriteResult`. Body: `{ definition }`. Saves to local.          |
| POST   | `/api/agents/:id/clone`          | `201 DefinitionWriteResult`. Body: `{ id, name? }`. A local copy.         |
| POST   | `/api/flows/:id/clone`           | `201 DefinitionWriteResult`. Body: `{ id, name? }`. A local copy.         |
| POST   | `/api/agents/:id/promote`        | `DefinitionWriteResult`. Body: `{ confirm? }`. Local to `.desk/`.         |
| POST   | `/api/flows/:id/promote`         | `DefinitionWriteResult`. Body: `{ confirm? }`. Local to `.desk/`.         |
| DELETE | `/api/agents/:id`                | `DefinitionWriteResult`. Deletes a local agent only.                      |
| DELETE | `/api/flows/:id`                 | `DefinitionWriteResult`. Deletes a local flow only.                       |

Artifact ids: `ticket`, `plan`, `build`, `check-report`, `review`, `diff`, `pr-body`,
`ship-plan`, `issue-draft`, `log`. A listed file that the issue has not written yet gives `404 artifact-missing`.
`log` is `events.jsonl`, the saved history. The `?after=` log is the live buffer in memory.

## Actions

| `action`      | Extra fields                               | Runner call                                           |
| ------------- | ------------------------------------------ | ----------------------------------------------------- |
| `start`       | `override?: boolean`, `flowId?: <flow id>` | `start(n, { override, flowId })`                      |
| `approve`     | `note?` (1 to 20000 characters after trim) | `approvePlan(n, { note })`                            |
| `feedback`    | `to: <step id>`, `text`                    | `feedback(n, to, text)`                               |
| `continue`    | `from?: <step id>`, or `intake`, `setup`   | `continueFrom(n, from)`                               |
| `cancel`      | none                                       | `cancel(n)`                                           |
| `remove`      | `force?: boolean`                          | `remove(n, { force })`                                |
| `ship`        | `confirm: boolean`, `dryRun?: boolean`     | `ship(n, { confirm, dryRun })`                        |
| `refresh-pr`  | none                                       | `refreshPr(n)`: read the PR at `pr-open` once         |
| `pr-feedback` | `text?` (1 to 20000 characters after trim) | `feedbackFromPr(n, { text })`                         |
| `draft`       | none                                       | `draft(n)`: done means `needs-you` with "Draft ready" |
| `apply-draft` | `confirm: true` (anything else is `400`)   | `applyDraft(n, { confirm })`                          |
| `pause`       | none                                       | `pause(n)`: hold the issue after the running stage    |
| `resume`      | none                                       | `resume(n)`: clear the hold and drive on              |

- Unknown fields are rejected (`400`). There is no field for a path or an organization.
- `start` without `flowId` runs the issue on the flow of its first label in the config's
  `flowLabels`, else on `defaultFlow`. An unknown flow, or one that does not validate, is
  `409 intake-refused` with the problems as the detail. A restarted intake keeps its flow.
- `feedback.to` and `continue.from` name a step of the issue's own flow snapshot. The server
  checks the step kind (`actionTargetProblem`): `feedback` goes to an agent or check step;
  `continue` restarts an agent, check, ship or pr-wait step, `setup`, or `intake`. A gate, a
  step of the wrong kind, or an id the flow does not have is `400 bad-request`, and the runner
  is not called. In the default flow `plan-gate`, `pr-review` and `ship` are no feedback
  targets. Whether the issue may go there now is the engine's decision: from a gate, only to
  its `sendBack` steps; from `needs-you`, any agent step (`409 invalid-transition`).
- `approve` with a `note` stores it as `approveNote` in the issue state. A new approval replaces
  it. Every later build gets it in its prompt, under "The owner's note at the plan approval", as
  the owner's answer to the plan's open questions. It never widens the plan's file list.
- `pause` sets `pauseRequested` and `pausedAt` in the issue state. It never stops an agent:
  the running stage ends as usual, and then the engine starts no next stage. The issue waits at
  that stage with status `waiting`. An action that would drive a paused issue (`approve`,
  `feedback`, `continue`) stops before its first stage. The answer is `stop: "paused"`. The pause
  is in the state file, so a restarted desk keeps it. `pause` refuses an issue at `shipped`,
  `cancelled`, or `finished` (`409 invalid-transition`). A second `pause` changes nothing.
- `resume` clears the pause and drives on from the stage where the issue waits. It refuses an
  issue that is not paused (`409 invalid-transition`). `cancel` clears a pause.
- Only `start` may run for an issue that has no state. Others give `404 unknown-issue`.
- `refresh-pr` takes no PR number: the engine reads it from the issue state. It answers `done`
  at the `pr-open` gate while the PR is open, `shipped` after a merge, and `cancelled` after a
  close without a merge. It never writes to the PR.
- `pr-feedback` takes no PR number either. At `pr-open` it collects the failing checks and the
  trusted review comments on the PR head, adds `text` as the owner's note, and drives the issue
  through `build`, `check`, and `review` to `pr-review`. A refusal is `409 pr-refused` and
  changes nothing. The rules are in "PR feedback" in `agent-desk.md`.
- A real `ship` needs `confirm: true`. A dry run may omit it. A dry run changes no state:
  it answers `done` at the gate, with the failed gate rules as the message, and writes
  `ship-plan.json` and `pr-body.md`. Read `pr-body.md` with the artifact id `pr-body` and `ship-plan.json` with `ship-plan`
  (the UI shows both in its ship dialog).
- A flow whose ship step has `auto: true` needs no `ship` action: the engine ships after the
  step before it, runs every gate rule but the confirmation, and opens a draft PR. The history
  records `ship-automatic`. See "Automatic ship" in `agent-desk.md`.
- The server waits up to 400 ms for the runner. If the call ends in that time, the
  answer is `200 { status: "done", outcome }`. A refusal is an error answer. If the call
  is still running, the answer is `202 { status: "accepted" }`. The result then arrives
  as an `action-result` event.
- One issue runs one action at a time. A second one gets `409 busy`. `cancel`, `remove`, and
  `pause` are the exception: they act on a running action. `pause` changes the running action's
  state at once, so it answers `done` with `stop: "paused"` while the stage still runs.
- `ActionOutcome.stop` is `gate`, `needs-you`, `shipped`, `cancelled`, `finished`, `removed`, or
  `paused`. `finished`: a flow without a ship step ran every step, and nothing shipped. Like
  `shipped` and `cancelled`, the stage `finished` is terminal: no action drives the issue again.

## Errors

The body is `{ "error": { "code": "<code>", "detail": "<raw text or null>" } }`.

| Code                                                                                             | Status |
| ------------------------------------------------------------------------------------------------ | ------ |
| `bad-request`                                                                                    | 400    |
| `unauthorized`                                                                                   | 401    |
| `forbidden`                                                                                      | 403    |
| `not-found`, `artifact-missing`, `unknown-issue`                                                 | 404    |
| `method-not-allowed`                                                                             | 405    |
| `busy`, `lesson-refused`, `definition-refused`                                                   | 409    |
| `leased`, `unreadable`, `invalid-transition`, `ship-refused`, `draft-refused`, `already-started` | 409    |
| `refresh-refused`, `pr-refused`                                                                  | 409    |
| `intake-refused`, `authorization`, `worktree-dirty`, `remove-failed`                             | 409    |
| `payload-too-large`                                                                              | 413    |
| `unsupported-media-type`                                                                         | 415    |
| `invalid-definition` (the detail lists every problem, one per line)                              | 422    |
| `internal` (the message is logged, never sent)                                                   | 500    |

The refusal codes (`leased` to `remove-failed`) mirror `REFUSALS` in the engine. A test
keeps the two lists equal.

## Issue summary

`IssueSummary` (the list, and `issue-updated`) holds everything a board card shows, so a
board never reads one detail for each card. Besides the stage, status, branch, loops,
`needsYouReason`, `busy`, and times, a readable summary has:

- `resumeStage`: the stage `continue` re-runs while the issue is in `needs-you`, or `null`.
- `prUrl`: the draft PR once the ship opened it, or `null`.
- `prRound` and `prRoundLimit`: the PR feedback rounds so far, and `maxPrRounds` of the config.
- `contract`: `{ found, total }` from the readiness line of `ticket.md`, or `null`.
- `stageEnteredAt`: when the issue entered its current stage. It is the latest history event
  that enters a stage (`stage-started`, `intake-started`, `plan-ready`, `review-approved`,
  `pr-opened`, `needs-you`, `interrupted`, `cancelled`, `pr-closed`, `flow-finished`, `pr-merged`, and
  `shipped` from older histories), if that stage is the current one;
  otherwise `null` (for example while a queued stage has not written its start).
- `progress`: the status of each node of the issue's flow, in flow order (the ticket, then each
  step), from `buildFlowModel`. The built-in flow has 9 nodes; another flow has its own count.
- `currentNode`: the flow node that holds the issue now, or `null`.
- `paused` and `pausedAt`: the owner paused the issue. With `busy`, the running stage still
  ends; then the issue waits until `resume`.
- `planRisk`: `low`, `medium`, or `high` from `plan.json`, or `null` before a graded plan exists.
- `flowId`, `flowName`, `flowHash`, `flowSource`, and `flowSteps`: the flow snapshot the issue
  runs on. `flowSteps` are its steps as `FlowStepView`s (see "Issue detail"), so a board names a
  stage and picks its controls without reading the detail of each issue.

## Issue detail

`IssueDetail` (`GET /api/issues/:n`) holds the summary, the full `state`, the flow model, the
artifact index, the contract, the check and review summaries, ship readiness, and `runs`. Also:

- `plan`: `{ risk, riskReasons, revision }` from `plan.json`, or `null` before the plan exists.
  A plan written before the risk fields reads as `risk: null` and `riskReasons: []`.
- `buildRevision`: what the latest build changed since the build before, from `build.json`.
  `null` for a first build and for a `build.json` without the field.
- `approveNote`: the owner's note at the plan approval, or `null`.
- `flowDefinition`: `{ id, name, hash, source, steps }` of the issue's flow snapshot. Each step
  is a `FlowStepView`: `{ id, label, kind, agent, sendBack, auto }`. `agent` is
  `{ id, name, output }` for an agent step, else `null`. `sendBack` lists a gate's targets (empty
  for other kinds); `auto` is true for a ship step that needs no confirmation.
- `resume`: `{ worktreePath, sessions }`. Each session is `{ role, sessionId, provider, command }`
  for `builder` and `planner`, builder first. `provider` comes from the role's run summary
  (`agent-<role>.json`), or `null` when the issue has none. `command` is the line
  `pnpm desk resume` prints, `cd <worktree> && claude --resume <id>` or `... && codex resume <id>`,
  or `null` without a provider or a worktree.

A `LogEntry` has `at` (ISO time) and `text`. The text has no time in it: the UI shows `at` in
the reader's zone and language. The CLI still prints a UTC `HH:MM:SS` before each line. `stage`
is the stage of a history event, or else the stage of the issue's latest state event in this
server. It is `null` when the server has not seen one, and absent on entries from before the
field existed.

## Stats

`RunStats` (`GET /api/stats`, `desk stats --json`) has `groups`, `issues`, and `invalidLines`,
and also:

- `groups`: one row for each role, agent, provider, and model. `agentId` is the agent of the
  runs. A line written before agents were data counts for the built-in agent of its role, whose
  id is the role.

- `riskOutcomes`: one `{ risk, issues, shipped, sentBack }` for each of `low`, `medium`, `high`.
  An issue counts at the risk of its latest graded run (`RunRecord.planRisk`). `shipped`: the
  desk opened its PR (`pr-open` or `shipped` now). `sentBack`: the plan was made again (two or
  more accepted planner runs) or a review sent the work back to `build`.
- `days`: the last 7 UTC days, oldest first, the last one today. Each is
  `{ date, runs, costUsd, shipped }`. `costUsd` is `null` when no run of the day reported a cost.
  `shipped` counts the issues whose latest `pr-opened` or `pr-updated` event fell on that day.

Every `RunRecord` has `planRisk`: the risk of the plan the run worked from (the planner's own
result, or the plan a builder or reviewer got). A line written before the field reads as `null`.

A `RunRecord` also has `capabilities`, the receipt of what the run actually got: a
`CapabilityProfile` (see "Agents and flows"). The engine resolves it when the agent starts. A
line written before the field has no `capabilities`.

## Agents and flows

The `GET` routes show the registry of the checkout the desk serves: the built-in definitions,
`.desk/` (repo), and `.ai.local/desk/` (local). A later source overrides an earlier one by id.
The write routes are in "Agent and flow writes".

- `AgentList` is `{ agents: AgentView[], problems, installed }`. `FlowList` is
  `{ flows: FlowView[], problems, defaultFlow }`. `problems` lists every agent (or flow) file
  that does not parse or validate, as `{ path, source, errors }`. Such a file takes part in
  nothing.
- `FlowList.defaultFlow` is the id that `defaultFlow` in the desk config names (default
  `kaine-default`). `start` picks this flow when no `flowLabels` label matches. The id can name
  a flow that is not in `flows`.
- `AgentList.installed` is `{ mcp, skills }`: the MCP server names of `.ai/mcp.json` and the skill
  names of `.ai/skills/` in the checkout, sorted. The capability resolver removes any other name
  that an agent asks for.
- Each view has `definition` (an agent includes its `prompt`), `source`, `shadows` (the source it
  overrides, or `null`), `readOnly` (built-in), `hash`, and `problems`: the broken files with the
  same id, for example a broken local override that the built-in definition still beats.
- `AgentView.resolved` is the `CapabilityProfile` a run of the agent gets with the desk's config
  now: the configured provider (the config decides for the built-in ids) and isolation. It has
  no workspace check commands, because a run gets them for the workspaces its plan names.

A `CapabilityProfile` is `{ provider, model, preset, sandbox, tools: { allow, deny }, extraTools,
mcp, skills, network, removed, notes }`:

- `sandbox`: `docker` for an `edit-code` agent when the isolation is Docker, `codex-read-only` or
  `codex-workspace-write` for Codex on the host, else `host` (the Claude allowlist).
- `tools`: the Claude allow and deny rules. Both are empty for Codex: its sandbox is the policy.
- `extraTools`: the extra tools of `AGENT_TOOLS` that the run gets, for example `["doc-export"]`.
  Only an `edit-code` agent gets them. A receipt written before the field reads as `[]`.
- `removed`: `{ kind, name, reason }` for each tool, MCP server, or skill the agent asked for
  and does not get. Reasons: `not installed` (not in the checkout's `.ai/mcp.json` or
  `.ai/skills`), `policy floor: ...`, `no MCP inside the container`, the Codex reason, and for
  an extra tool `unknown tool` or `needs the edit-code preset`.
- `network` and `notes` are engine text, for example `Codex: sandbox only, no MCP`.

The policy floor always applies, and an agent can only narrow it: the `.ai/permissions.json`
denies, the forbidden git and desk commands, WebFetch and WebSearch, the Serena tools that write
memory or run commands, the protected paths, and every skill outside the agent's list.

### Agent and flow writes

Saving goes local first; promote moves a definition to the repository. Every write needs the
session and the `x-desk-request` header, like every other write.

- `PUT /api/agents/:id` (`{ definition: AgentDefinition }`) writes
  `.ai.local/desk/agents/<id>.md`: the frontmatter as YAML, then the prompt.
  `PUT /api/flows/:id` (`{ definition: FlowDefinition }`) writes `.ai.local/desk/flows/<id>.yaml`.
  The path id must equal `definition.id` (`400`). The server validates first: an agent with
  `validateAgent`, a flow with `validateFlow` against the registry's agents and with the rule
  that a ship the owner confirms comes directly after a gate. A definition with problems is
  `422 invalid-definition`, every problem on its own line, and nothing is written. A local
  definition may take a built-in or repo id: it overrides that definition, and the answer says
  so in `shadows`.
- `POST .../:id/clone` (`{ id, name? }`) copies any definition (built-in, repo or local) to a new
  local id. `name` defaults to `"<name> (copy)"`. An id that any source has, even as a broken
  file, is `409 definition-refused`. An unknown source id is `404`.
- `POST .../:id/promote` (`{ confirm?: boolean }`) copies the local file to `.desk/agents` or
  `.desk/flows`, then deletes the local copy. A repo file with the same id is overwritten only
  with `confirm: true` (else `409 definition-refused`). A local file that does not load is
  `422 invalid-definition`; no local file is `404`. The desk never commits or stages the file:
  `uncommitted: true` tells the UI to say "commit it like code".
- `DELETE /api/agents/:id` and `DELETE /api/flows/:id` delete a local definition only. A built-in
  or repo id is `409 definition-refused`; an unknown id is `404`. An agent that a flow of the
  registry uses (any source) stays: `409 definition-refused` names those flows.
- Ids match `^[a-z0-9][a-z0-9-]{0,63}$`, and the file name is the id. The server resolves each
  path and writes nothing outside `.ai.local/desk/` and `.desk/`.

`DefinitionWriteResult` is `{ kind, id, path, source, shadows, uncommitted }`. `path` is the file
written (or deleted). `source` is the source that wins the id after the write (`null` when none
has it), and `shadows` the lower source that the winner overrides, or `null`.

## Lessons

`LessonReport` has `candidates` (without the promoted keys), `promoted` (newest first),
`belowThreshold`, `minIssues`, `currentRepo`, and `invalidLines`. A `PromotedLesson` is
`{ key, at, note, issue }`. The desk keeps them in `<state>/lessons-promoted.json`, beside
`lessons.jsonl`, written atomically. `pnpm desk lessons` leaves the promoted keys out too.

- `promote` marks a key handled. A second `promote` replaces the note and keeps the issue.
- `issue-preview` answers the exact title and body the desk sends: the six sections of
  [issue-format.md](issue-format.md), then `## Origin` with the owner's note. Lesson text is
  data from agent runs: the body quotes the samples in a code block that they cannot close, and
  no lesson text goes into a prompt. `digest` is the SHA-256 of the title, a newline, and the body.
- `issue` needs `confirm: true` (anything else is `400`) and the `digest` of the preview the owner
  saw. It checks that `gh` is signed in as the owner, opens the issue with `gh issue create`, and
  promotes the key with the new issue number. A lesson that changed since the preview, a key that
  already has an issue, a wrong `gh` login, or a GitHub failure is `409 lesson-refused`, and no
  issue is opened.
- A desk without `lessonActions` answers these routes with `404`.

## Events

`GET /api/events` is a `text/event-stream`. Each frame has `event: <type>` and one JSON
line in `data:`. The server sends `: ping` every 15 s.

| `type`          | Payload                                                   |
| --------------- | --------------------------------------------------------- |
| `issue-updated` | `{ summary: IssueSummary }`                               |
| `issue-removed` | `{ issueNumber }`                                         |
| `action-result` | `{ issueNumber, action, outcome \| null, error \| null }` |
| `log`           | `{ entry: LogEntry }`                                     |
| `health`        | `{ report: HealthReport }`                                |
| `health-fix`    | `{ result: { fix, ok, detail } }` when a repair ends      |

A `pause` and a `resume` write the state and a history event (`pause-requested`, `paused`,
`resumed`), so they reach the page as `issue-updated` and `log` like any other change.

Two sources feed `issue-updated`: the runner's events (fast), and a comparison of the
store every 2 s with `fs.watch` as a trigger. The comparison shows changes from a CLI
run in another terminal. Both run only while a client is connected. After the stream
opens, load `GET /api/issues` once to close the gap.

## Flow model

`buildFlowModel(state, now)` in `@repo/desk/contracts` returns the graph that the UI
draws. It reads only the issue state and its history. `IssueDetail.flow` holds the
same result.

- Nodes: `ticket`, `plan`, `plan-gate`, `build`, `check`, `review`, `pr-review`, `ship`,
  `pr-open` (below `ship` in its column; `shipped` reads as this node done).
  Each has `kind`, `role`, `status` (`idle`, `running`, `waiting`, `passed`, `looped`,
  `failed`), `current`, a fixed `x` and `y`, `metrics` (runs, last duration), `activity`,
  and `badge` (`needs-you` with the first line of the reason, or `cancelled`).
- Edges: forward edges in flow step order, and dashed loop-backs. Each has `state`
  (`idle`, `traversed`, `active`), `tone` (`neutral`, `warn`, `bad`), handles, an `arc`,
  `loopKind`, and counts (`count` for automatic loops, `feedbackCount` for the
  engineer's feedback, `blocking` for the latest review loop).
- The model has codes and numbers, no display text.
