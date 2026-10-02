# Local software factory

The factory is optional and disabled by default. GitHub holds issues and decisions.
A local controller runs Codex and Claude in disposable Linux Docker containers.
The owner reviews and merges every PR manually.

## Local dashboard

After initialization, start the dashboard from the trusted controller checkout:

```sh
pnpm factory ui
pnpm factory ui --port 4380 --no-open
```

The launcher builds `@repo/factory-ui` through Turbo, selects an available loopback
port by default, and opens a per-launch browser session. With `--no-open`, open the
printed URL yourself. Its one-use fragment establishes an HttpOnly cookie. The
browser removes the fragment immediately. Refresh and additional tabs on the same
origin use the cookie. A new dashboard launch requires its new launch URL.

The default view includes all linked worktrees of this Git repository. Select a
worktree to start work there. Run details and cancellation retain the originating
worktree. The controller uses its own installed code for every action, including
actions in an older checkout. CLI commands can select the same checkout with
`--checkout <path>`. Paths supplied by the browser are rejected; actions use
server-resolved worktree IDs. Runs started in another CLI appear automatically.

Board shows active work, blockers, the issue queue, and recent runs. Runs provides
filters and issue-grouped attempts. Open a run for its phase timeline, checks,
acceptance evidence, independent review, and redacted validation log tails. The
pilot filter is separate from ordinary issue totals. Health shows Docker,
credential detection, isolation, model versions, and live pilot evidence. Missing
or stale evidence never establishes readiness. Historical records remain readable;
timing and usage absent from older records appear as unavailable.

Start, retry, cancel, doctor, pilot, and watcher controls execute the existing CLI.
An action returns an ID before work starts. Network retries with that ID reuse the
action. Model selection and possible GitHub writes appear before submission.
Readiness is checked again in the controller. Login, configuration, readiness
approval, and merging remain in the terminal or GitHub. Opening the dashboard does
not enable the factory or start the watcher.

Closing a browser tab leaves work running. Stop the foreground dashboard command
with Ctrl+C to stop and clean up work it started. Independent CLI runs are left
alone. Interrupted actions display `cleanup-unverified`; they never restart
automatically. Use the run's cancel control to verify cleanup before retrying.
An independent watcher must be stopped in its owning terminal. A stale
`runs/watcher.json` marker requires manual process inspection before removal.

Progress journals, artifact registrations, action receipts, and cached GitHub
snapshots live under gitignored `.ai.local/factory/runs/`. Validation output is
bounded and redacted. Only registered screenshots and videos preview inline;
trace archives and HTML reports download. Local paths are not public evidence
links. Subscription quota and monetary cost remain unavailable when not reported.
Current commands show their start and last-output times. Select Logs to follow
output while a command runs. Turn off Follow output to inspect earlier lines.
Incomplete credential fragments remain buffered until they can be redacted.

Shared leases, action keys, and completed readiness decisions live under
`kaine-factory/` in Git's common directory. Two runs can be active across the
repository, with one per worktree. The same issue cannot run in two worktrees.
Heavy validation commands and calls sharing subscription credentials wait for
their resource. Waiting does not consume the model invocation timeout. Retry
from the failed attempt's original worktree. Locks are never stolen after a crash.

Local polling runs every two seconds during activity and every ten seconds while
idle. GitHub refreshes every 60 seconds. The last successful refresh remains visible
when GitHub is offline. The foreground watcher retains the real-issue rollout gate.

The HTTP adapter is developer tooling, separate from the Organization-scoped
product API. See [ADR 0010](../adr/0010-local-factory-dashboard.md).

Validation commands:

```sh
pnpm --filter @repo/factory-ui build
pnpm --filter @repo/factory-ui test:browser
pnpm check
```

Browser tests use deterministic API fixtures and make no GitHub writes or model
calls. Session, artifact, action idempotency, and process ownership tests run in
the AI tooling test suite. Browser screenshots and traces stay in ignored test
output directories.

## Setup

Run from the repository root:

```sh
docker build -f .ai/docker/factory.Dockerfile -t kaine-factory:local .
pnpm factory init --image kaine-factory:local
pnpm factory login --provider codex
pnpm factory login --provider claude
pnpm factory doctor
```

Complete each subscription login in your browser. Codex uses device login inside
Docker. Claude uses its interactive `/login` flow. Select the Claude subscription
option, open its URL, then paste the returned code into the terminal prompt.
The worker closes once the credential is saved. Authentication uses dedicated
Docker volumes per repository and provider. Existing subscription credentials can
also be copied with `login --provider <provider> --import-existing`. This copies
only the provider credential file, never the host's complete configuration.
No API key is required. Defaults are `gpt-6-astra` and `claude-opus-5-5`,
both at high effort. There is no model fallback. Subscription limits still apply.
The worker pins Claude Code 2.1.283. Opus 5.5 requires 2.1.280 or later;
older clients can sign in successfully but cannot run that model.
If authentication expires, log in again.
Provider state remains in its isolated Docker volume so refresh-token rotation
survives worker shutdown. Prefer a separate factory login; importing an existing
session can invalidate its host copy when the provider rotates its token.

Configuration is `.ai.local/factory/config.json`. `init` records the immutable
image ID. Rebuild after worker changes and update that ID. Keep `enabled` false
until both worker probes pass. Then set it true. `gh` must authenticate as the
configured human owner. For organization repositories, set `owner` to the human
maintainer's login. Git author name and email must identify that human.

`doctor` verifies that the image contains the canonical worker scripts, the policy
filesystem is read-only, host credentials and the Docker socket are absent, direct
network interfaces are absent, and the proxy permits a provider connection while
rejecting an unrelated destination. Authentication status checks do not consume a
model call. Live pilots establish that the configured subscription can run a model.

## Issue contract

Use these exact Markdown headings. Scope lists one repository-relative file or
directory per line. Wildcards and `unknown` are not implementation scopes.

```md
## Outcome

State one observable result.

## Acceptance criteria

- State an independently verifiable behavior.

## Scope

- packages/example

## Validation

code

## Evidence

State a reproduction or a source location.

## Out of scope

State exclusions, or explicitly write none.
```

Validation is `docs`, `code`, `runtime`, `web`, or `native`. Native verification
blocks unattended publication. The controller increases checks for runtime and
web paths. Intake can investigate an issue whose scope is not yet known.
Include required generated outputs and changeset paths in the approved scope.
Code runs regenerate GraphQL outputs through `pnpm generate`. The controller
stages only approved paths and blocks publication if validation changes other
tracked files. Follow existing changeset policy for app and package changes.

The owner applies `ready-for-agent` after completing the issue. New requirements
invalidate that decision: remove and reapply the label. The factory snapshots the
issue and comments. Its own status comments do not change that snapshot. An agent's
readiness recommendation is never authorization.

## Commands

```sh
pnpm factory run --issue 123 --stage intake
pnpm factory run --issue 123 --stage spec
pnpm factory run --issue 123 --stage implement
pnpm factory run --issue 123 --stage review --provider claude
pnpm factory run --issue 123 --stage learn
pnpm factory status
pnpm factory cancel --run <run-id>
```

Intake recommends the next action. Specification writes `docs/specs/<issue>.md`
and opens a draft PR. Implementation requires owner authorization. Learning only
proposes durable improvements; it never changes skills automatically.

## Boundaries

Workers receive bounded source packets and return full file contents. They do not
execute repository code or GitHub operations. Oversized or insufficient context
blocks work. The controller validates paths and scope. Symlinks, secret files, Git
configuration, workflow files, and factory policy require supervised changes.

Workers have no network interface. A Unix socket carries TLS connections through
a separate proxy restricted to subscription-provider hosts. No host home, checkout,
Docker socket, or GitHub credential is mounted. Claude tools are disabled. Codex
shell, browser, MCP, plugin, and delegation features are disabled; unexpected tool
events fail the run. Read-only permissions remain enabled.

The controller preserves the proposal in a separate clone and transfers a Git
bundle into a run-specific Docker volume. Checks, dependencies, and commits stay
in Linux storage. Candidate dependency trees never cross onto Windows. Dependency
setup and checks run without provider or GitHub credentials. Dependency downloads
run in a separate volume that contains only the lockfile,
registered `patches/*.patch` files, and a controller-written package-manager pin.
This container has no network interface. Its only route is a dedicated proxy
that permits HTTPS CONNECT to `registry.npmjs.org:443`. Other hosts, ports, plain
HTTP, and redirects to other hosts are denied. Private registries and Git-hosted
dependencies require a reviewed extension of this policy. Lifecycle scripts and
pnpm hooks are disabled during fetch.
It cannot read the proposed checkout or its package-manager configuration.
Installation uses the downloaded store offline. Validation, repair, and final
checks reuse that run's volumes. Dependency inputs determine whether another
fetch is needed. Runs do not share a dependency cache. Rebuilds, repository hooks,
and validation have no external network. Git trusts only `/workspace`.
Web checks use disposable loopback PostgreSQL
and serial Playwright scenarios. Repository commit hooks run in that container.
The controller imports the commit, checks parent and scope, obtains independent
review, then pushes through the trusted checkout's normal pre-push hook.
It never force-pushes, approves, merges, or runs release:apps.

Each model invocation has a 30-minute limit, with at most one implementation
repair. Fetch, installation, and cleanup failures stop work without spending that
repair. Failures preserve the clone and logs. Before deleting owned volumes, the
controller exports bounded evidence and a recovery patch. Export and cleanup
failures are separate from command failure. Unverified cleanup retains resources
and blocks retry. Recovery checks exact names and ownership labels; it never prunes
Docker. Retry explicitly.
Retries reuse a recorded factory branch and open PR. An unrecorded remote branch
or a branch that needs a rebase blocks work for human inspection. The controller
never overwrites a changed remote head.
After a crash, cancel the recorded run to stop its containers and release the stale
lock. One recovery receipt per run prevents concurrent cancellation from removing
a new controller's lock. If recovery itself stops before releasing the lock,
subsequent attempts report cleanup as unverified and preserve it for manual
inspection. A live controller releases its own lock after cancellation.
Cancellation stops subsequent actions. A GitHub request or push already in flight
can finish; inspect its remote result before retrying. A candidate revision is
saved before push, so a retry reuses the same branch and existing PR.

Status comments are excluded from readiness snapshots only when their recorded
ID and content fingerprint match. Owner edits remain requirements. Older records
without comment receipts fail closed and can require a fresh readiness label.
Learning includes owner feedback from both specification and implementation PRs.

## Evidence and rollout

Private run records, logs, and clones live under `.ai.local/factory/`. Local paths
are not public artifact links. PR CI supplies separate remote artifacts. Process
completion and acceptance are distinct: each criterion needs independent review
evidence and all required checks must pass before publication.

Compatible per-invocation reports are in `.ai.local/factory/reports/`. Use
`pnpm agent:report --runs .ai.local/factory/reports` for duration and available token
usage. Use `pnpm agent:outcome --run <report.json> --outcome accepted --minutes 10
--note "Reviewed and accepted"` to record human acceptance and review time.
Supported outcomes also include `rework-required` and `rejected`. A successful
process never sets these outcomes automatically. Subscription quota remaining is
not available from the CLI result and is not estimated.

Run all six local fixture pilots in this order. Check each item only after its
final result passes:

- [ ] `pnpm factory pilot --provider codex --tier docs`
- [ ] `pnpm factory pilot --provider codex --tier code`
- [ ] `pnpm factory pilot --provider codex --tier web`
- [ ] `pnpm factory pilot --provider claude --tier docs`
- [ ] `pnpm factory pilot --provider claude --tier code`
- [ ] `pnpm factory pilot --provider claude --tier web`

Both providers use the same tier checks:

- `docs` checks README install, start, and stop instructions.
- `code` checks addition with positive, negative, zero, and fractional operands.
- `web` checks counter behavior with mouse and keyboard interaction.

Each pilot starts with an intentionally failing fixture. This initial failure is
expected: each pilot requires a failing baseline and a passing independent check
after the model change. If the final result fails, stop the checklist and inspect
the saved evidence before retrying. The web pilot saves a screenshot, video, and
trace. Run records and evidence remain under `.ai.local/factory/`.

Pilots make no GitHub writes and can run while the factory is disabled. They do
not prove draft PR delivery. Also complete an owner-approved issue through a
verified draft PR. Confirm cancellation, evidence, and remote checks. Only then
enable `watch` in configuration and start:

```sh
pnpm factory watch
```

The foreground watcher requires all six matching pilot receipts and a completed
owner-approved implementation with a draft PR. Image, model,
or worker policy changes invalidate the receipts. It polls every 60 seconds,
routes open issues through intake, specifications, and owner-authorized
implementation, and reports changed CI or Release failures. It never retries
failed decisions automatically. Stop with Ctrl+C.
No service is installed. The computer and Docker must remain running. Production
telemetry and other providers are outside this version.
