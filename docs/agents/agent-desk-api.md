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
| GET    | `/api/github[?refresh=1]`        | `GithubLists`: open issues and PRs. Cached 60 s; `ok: false` + reason.    |
| GET    | `/api/stats`                     | `RunStats` from `runs.jsonl`: runs by role, provider, model, and issue.   |
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

Artifact ids: `ticket`, `plan`, `build`, `check-report`, `review`, `diff`, `pr-body`,
`ship-plan`, `issue-draft`, `log`. A listed file that the issue has not written yet gives `404 artifact-missing`.
`log` is `events.jsonl`, the saved history. The `?after=` log is the live buffer in memory.

## Actions

| `action`      | Extra fields                                             | Runner call                                           |
| ------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| `start`       | `override?: boolean`                                     | `start(n, { override })`                              |
| `approve`     | `note?` (1 to 20000 characters after trim)               | `approvePlan(n, { note })`                            |
| `feedback`    | `to: plan\|build\|review`, `text`                        | `feedback(n, to, text)`                               |
| `continue`    | `from?: intake\|setup\|plan\|build\|check\|review\|ship` | `continueFrom(n, from)`                               |
| `cancel`      | none                                                     | `cancel(n)`                                           |
| `remove`      | `force?: boolean`                                        | `remove(n, { force })`                                |
| `ship`        | `confirm: boolean`, `dryRun?: boolean`                   | `ship(n, { confirm, dryRun })`                        |
| `refresh-pr`  | none                                                     | `refreshPr(n)`: read the PR at `pr-open` once         |
| `pr-feedback` | `text?` (1 to 20000 characters after trim)               | `feedbackFromPr(n, { text })`                         |
| `draft`       | none                                                     | `draft(n)`: done means `needs-you` with "Draft ready" |
| `apply-draft` | `confirm: true` (anything else is `400`)                 | `applyDraft(n, { confirm })`                          |
| `pause`       | none                                                     | `pause(n)`: hold the issue after the running stage    |
| `resume`      | none                                                     | `resume(n)`: clear the hold and drive on              |

- Unknown fields are rejected (`400`). There is no field for a path or an organization.
- `approve` with a `note` stores it as `approveNote` in the issue state. A new approval replaces
  it. Every later build gets it in its prompt, under "The owner's note at the plan approval", as
  the owner's answer to the plan's open questions. It never widens the plan's file list.
- `pause` sets `pauseRequested` and `pausedAt` in the issue state. It never stops an agent:
  the running stage ends as usual, and then the engine starts no next stage. The issue waits at
  that stage with status `waiting`. An action that would drive a paused issue (`approve`,
  `feedback`, `continue`) stops before its first stage. The answer is `stop: "paused"`. The pause
  is in the state file, so a restarted desk keeps it. `pause` refuses an issue at `shipped` or
  `cancelled` (`409 invalid-transition`). A second `pause` changes nothing.
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
- The server waits up to 400 ms for the runner. If the call ends in that time, the
  answer is `200 { status: "done", outcome }`. A refusal is an error answer. If the call
  is still running, the answer is `202 { status: "accepted" }`. The result then arrives
  as an `action-result` event.
- One issue runs one action at a time. A second one gets `409 busy`. `cancel`, `remove`, and
  `pause` are the exception: they act on a running action. `pause` changes the running action's
  state at once, so it answers `done` with `stop: "paused"` while the stage still runs.
- `ActionOutcome.stop` is `gate`, `needs-you`, `shipped`, `cancelled`, `removed`, or `paused`.

## Errors

The body is `{ "error": { "code": "<code>", "detail": "<raw text or null>" } }`.

| Code                                                                                             | Status |
| ------------------------------------------------------------------------------------------------ | ------ |
| `bad-request`                                                                                    | 400    |
| `unauthorized`                                                                                   | 401    |
| `forbidden`                                                                                      | 403    |
| `not-found`, `artifact-missing`, `unknown-issue`                                                 | 404    |
| `method-not-allowed`                                                                             | 405    |
| `busy`, `lesson-refused`                                                                         | 409    |
| `leased`, `unreadable`, `invalid-transition`, `ship-refused`, `draft-refused`, `already-started` | 409    |
| `refresh-refused`, `pr-refused`                                                                  | 409    |
| `intake-refused`, `authorization`, `worktree-dirty`, `remove-failed`                             | 409    |
| `payload-too-large`                                                                              | 413    |
| `unsupported-media-type`                                                                         | 415    |
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
  `pr-opened`, `needs-you`, `interrupted`, `cancelled`, `pr-closed`, `pr-merged`, and
  `shipped` from older histories), if that stage is the current one;
  otherwise `null` (for example while a queued stage has not written its start).
- `progress`: the status of each of the 9 flow nodes, in `FLOW_NODE_IDS` order, from
  `buildFlowModel`.
- `currentNode`: the flow node that holds the issue now, or `null`.
- `paused` and `pausedAt`: the owner paused the issue. With `busy`, the running stage still
  ends; then the issue waits until `resume`.
- `planRisk`: `low`, `medium`, or `high` from `plan.json`, or `null` before a graded plan exists.

## Issue detail

`IssueDetail` (`GET /api/issues/:n`) holds the summary, the full `state`, the flow model, the
artifact index, the contract, the check and review summaries, ship readiness, and `runs`. Also:

- `plan`: `{ risk, riskReasons, revision }` from `plan.json`, or `null` before the plan exists.
  A plan written before the risk fields reads as `risk: null` and `riskReasons: []`.
- `buildRevision`: what the latest build changed since the build before, from `build.json`.
  `null` for a first build and for a `build.json` without the field.
- `approveNote`: the owner's note at the plan approval, or `null`.
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

- `riskOutcomes`: one `{ risk, issues, shipped, sentBack }` for each of `low`, `medium`, `high`.
  An issue counts at the risk of its latest graded run (`RunRecord.planRisk`). `shipped`: the
  desk opened its PR (`pr-open` or `shipped` now). `sentBack`: the plan was made again (two or
  more accepted planner runs) or a review sent the work back to `build`.
- `days`: the last 7 UTC days, oldest first, the last one today. Each is
  `{ date, runs, costUsd, shipped }`. `costUsd` is `null` when no run of the day reported a cost.
  `shipped` counts the issues whose latest `pr-opened` or `pr-updated` event fell on that day.

Every `RunRecord` has `planRisk`: the risk of the plan the run worked from (the planner's own
result, or the plan a builder or reviewer got). A line written before the field reads as `null`.

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
- Edges: forward edges from `PIPELINE`, and dashed loop-backs. Each has `state`
  (`idle`, `traversed`, `active`), `tone` (`neutral`, `warn`, `bad`), handles, an `arc`,
  `loopKind`, and counts (`count` for automatic loops, `feedbackCount` for the
  engineer's feedback, `blocking` for the latest review loop).
- The model has codes and numbers, no display text.
