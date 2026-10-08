# Agent desk server API

`createDeskServer` (`tooling/desk/src/server`) serves a local HTTP API, a server-sent
event stream, and a built UI. It is local developer tooling. It is never mounted in
`apps/api`. The manual for the desk is [agent-desk.md](agent-desk.md). The decision is
in [ADR 0011](../adr/0011-local-agent-desk.md).

Wire types live in `@repo/desk/contracts` (`api.contract.ts`, `flow.model.ts`). They
import only Zod, so a browser can use them.

## Start and connect

- `launchDeskServer({ port?, open?, uiDir?, depsFactory?, cwd?, print?, tuning? })`
  builds the runtime, starts the server, prints the launch URL, and returns
  `{ server, url, launchUrl, close, runtime }`.
- `serveDesk({ ...same options, signal? })` does the same, then waits for SIGINT,
  SIGTERM, or `signal`, then closes. This is what `pnpm desk serve` calls.
- `depsFactory(onEvent)` returns a `DeskRuntime`: `{ runner, store, health, currentDiffHash?, uiDir?, dispose? }`.
  Pass the given `onEvent` to `createPipelineRunner` as `PipelineDeps.onEvent`. The server
  listens to it for live logs and fast updates. Without a factory the server builds the
  real runtime (`createDefaultDeskRuntime`).
- The launch URL is `http://127.0.0.1:<port>/#session=<token>`. The token is in the URL
  fragment, so it never reaches a server log or a `Referer` header. The page posts it to
  `POST /api/session` once. The server answers with an `HttpOnly; SameSite=Strict`
  cookie. The token works one time.

## Security rules

- The listener binds to `127.0.0.1` only. The default port is random.
- Every request must carry `Host: 127.0.0.1:<port>` or `localhost:<port>`. Anything else
  gets `403 forbidden` (DNS rebinding).
- An `Origin` header, when present, must be the server's own origin.
  `Sec-Fetch-Site: cross-site` gets `403`.
- A write (`POST`) needs an `Origin` header, the header `x-desk-request: 1`, and
  `Content-Type: application/json`. The body is limited to 64 KiB.
- Every `/api/*` route except `POST /api/session` needs the session cookie
  (`401 unauthorized` without it). Static files need no cookie.
- Every response has a strict CSP, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, and `X-Frame-Options: DENY`.
- A client names an artifact by id and an issue by number. It never sends a path.
  Symbolic links and non-files are not served.
- The server returns codes and raw engine text. The UI escapes and translates.

## Routes

| Method | Path                             | Answer                                                                  |
| ------ | -------------------------------- | ----------------------------------------------------------------------- |
| POST   | `/api/session`                   | `{ ok: true }` and the session cookie. Body: `{ token }`. One use.      |
| GET    | `/api/health`                    | `HealthReport` (doctor mirror). Cached for 10 s.                        |
| GET    | `/api/events`                    | Event stream. See "Events".                                             |
| GET    | `/api/issues`                    | `{ issues: IssueSummary[] }`. An unreadable issue has `readable:false`. |
| GET    | `/api/issues/:n`                 | `IssueDetail`. `404 unknown-issue`, `409 unreadable`.                   |
| GET    | `/api/issues/:n/artifacts/:id`   | The raw file. `404 not-found` for an id outside the list.               |
| GET    | `/api/issues/:n/log?after=<seq>` | `{ entries, last }`. The live buffer (500 entries for each issue).      |
| POST   | `/api/issues/:n/actions`         | `ActionRequest`. `200` done, `202` accepted, or an error.               |

Artifact ids: `ticket`, `plan`, `build`, `check-report`, `review`, `diff`, `pr-body`,
`ship-plan`, `log`. A listed file that the issue has not written yet gives `404 artifact-missing`.
`log` is `events.jsonl`, the saved history. The `?after=` log is the live buffer in memory.

## Actions

| `action`   | Extra fields                                             | Runner call                    |
| ---------- | -------------------------------------------------------- | ------------------------------ |
| `start`    | `override?: boolean`                                     | `start(n, { override })`       |
| `approve`  | none                                                     | `approvePlan(n)`               |
| `feedback` | `to: plan\|build\|review`, `text`                        | `feedback(n, to, text)`        |
| `continue` | `from?: intake\|setup\|plan\|build\|check\|review\|ship` | `continueFrom(n, from)`        |
| `cancel`   | none                                                     | `cancel(n)`                    |
| `remove`   | `force?: boolean`                                        | `remove(n, { force })`         |
| `ship`     | `confirm: boolean`, `dryRun?: boolean`                   | `ship(n, { confirm, dryRun })` |

- Unknown fields are rejected (`400`). There is no field for a path or an organization.
- Only `start` may run for an issue that has no state. Others give `404 unknown-issue`.
- A real `ship` needs `confirm: true`. A dry run may omit it. A dry run changes no state:
  it answers `done` at the gate, with the failed gate rules as the message, and writes
  `ship-plan.json` and `pr-body.md`. Read `pr-body.md` with the artifact id `pr-body` and `ship-plan.json` with `ship-plan`
  (the UI shows both in its ship dialog).
- The server waits up to 400 ms for the runner. If the call ends in that time, the
  answer is `200 { status: "done", outcome }`. A refusal is an error answer. If the call
  is still running, the answer is `202 { status: "accepted" }`. The result then arrives
  as an `action-result` event.
- One issue runs one action at a time. A second one gets `409 busy`. `cancel` and
  `remove` are the exception: they exist to stop a running action.

## Errors

The body is `{ "error": { "code": "<code>", "detail": "<raw text or null>" } }`.

| Code                                                                            | Status |
| ------------------------------------------------------------------------------- | ------ |
| `bad-request`                                                                   | 400    |
| `unauthorized`                                                                  | 401    |
| `forbidden`                                                                     | 403    |
| `not-found`, `artifact-missing`, `unknown-issue`                                | 404    |
| `method-not-allowed`                                                            | 405    |
| `busy`                                                                          | 409    |
| `leased`, `unreadable`, `invalid-transition`, `ship-refused`, `already-started` | 409    |
| `intake-refused`, `authorization`, `worktree-dirty`, `remove-failed`            | 409    |
| `payload-too-large`                                                             | 413    |
| `unsupported-media-type`                                                        | 415    |
| `internal` (the message is logged, never sent)                                  | 500    |

The refusal codes (`leased` to `remove-failed`) mirror `REFUSALS` in the engine. A test
keeps the two lists equal.

## Issue summary

`IssueSummary` (the list, and `issue-updated`) holds everything a board card shows, so a
board never reads one detail for each card. Besides the stage, status, branch, loops,
`needsYouReason`, `busy`, and times, a readable summary has:

- `resumeStage`: the stage `continue` re-runs while the issue is in `needs-you`, or `null`.
- `prUrl`: the draft PR once shipped, or `null`.
- `contract`: `{ found, total }` from the readiness line of `ticket.md`, or `null`.
- `stageEnteredAt`: when the issue entered its current stage. It is the latest history event
  that enters a stage (`stage-started`, `intake-started`, `plan-ready`, `review-approved`,
  `needs-you`, `interrupted`, `cancelled`, `shipped`), if that stage is the current one;
  otherwise `null` (for example while a queued stage has not written its start).
- `progress`: the status of each of the 8 flow nodes, in `FLOW_NODE_IDS` order, from
  `buildFlowModel`.
- `currentNode`: the flow node that holds the issue now, or `null`.

A `LogEntry` has `at` (ISO time) and `text`. The text has no time in it: the UI shows `at` in
the reader's zone and language. The CLI still prints a UTC `HH:MM:SS` before each line.

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

Two sources feed `issue-updated`: the runner's events (fast), and a comparison of the
store every 2 s with `fs.watch` as a trigger. The comparison shows changes from a CLI
run in another terminal. Both run only while a client is connected. After the stream
opens, load `GET /api/issues` once to close the gap.

## Flow model

`buildFlowModel(state, now)` in `@repo/desk/contracts` returns the graph that the UI
draws. It reads only the issue state and its history. `IssueDetail.flow` holds the
same result.

- Nodes: `ticket`, `plan`, `plan-gate`, `build`, `check`, `review`, `pr-review`, `ship`.
  Each has `kind`, `role`, `status` (`idle`, `running`, `waiting`, `passed`, `looped`,
  `failed`), `current`, a fixed `x` and `y`, `metrics` (runs, last duration), `activity`,
  and `badge` (`needs-you` with the first line of the reason, or `cancelled`).
- Edges: forward edges from `PIPELINE`, and dashed loop-backs. Each has `state`
  (`idle`, `traversed`, `active`), `tone` (`neutral`, `warn`, `bad`), handles, an `arc`,
  `loopKind`, and counts (`count` for automatic loops, `feedbackCount` for the
  engineer's feedback, `blocking` for the latest review loop).
- The model has codes and numbers, no display text.
