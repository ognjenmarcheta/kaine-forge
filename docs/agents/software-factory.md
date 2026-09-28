# Local software factory

The factory is optional and disabled by default. GitHub holds issues and decisions.
A local controller runs Codex and Claude in disposable Linux Docker containers.
The owner reviews and merges every PR manually.

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

The controller applies changes in a separate clone. Dependency setup and checks
run without provider or GitHub credentials. Dependency downloads run in a separate directory that contains only the lockfile,
registered `patches/*.patch` files, and a controller-written package-manager pin.
This container has no network interface. Its only route is a dedicated proxy
that permits HTTPS CONNECT to `registry.npmjs.org:443`. Other hosts, ports, plain
HTTP, and redirects to other hosts are denied. Private registries and Git-hosted
dependencies require a reviewed extension of this policy. Lifecycle scripts and
pnpm hooks are disabled during fetch.
It cannot read the proposed checkout or its package-manager configuration.
Installation uses the downloaded store offline. Temporary download directories
are removed after installation, failed fetches, cancellation, and preparation errors. Rebuilds, repository hooks, and
validation have no external network. Git trusts only the mounted `/workspace` path to handle
Windows/Linux ownership differences. Web checks use disposable loopback PostgreSQL
and serial Playwright scenarios. Repository commit hooks run in that container.
The controller imports the commit, checks parent and scope, obtains independent
review, then pushes through the trusted checkout's normal pre-push hook.
It never force-pushes, approves, merges, or runs release:apps.

One issue runs at a time. Each model invocation has a 30-minute limit, with at most
one implementation repair. Failures preserve the clone and logs. Retry explicitly.
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
