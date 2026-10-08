# ADR 0011: Local agent desk

## Status

Accepted. The desk ships in phases. Phase 1 covers intake. Phase 2 adds the pipeline engine (library first, then the CLI). Phase 3 adds the ship step and the local server. Phase 4 adds the React desk. Phase 5 adds optional Docker isolation.

## Context

The software factory (ADR 0010) runs workers with no tools and no network. Workers
return whole files as JSON. The factory has no plan approval, no feedback loop,
and it has not yet run on a real issue. One engineer needs a tool that gives an
issue to a planner, a builder, and a reviewer, with two human gates, and that
opens a draft PR.

## Decision

Build one new engine in the private `@repo/desk` workspace (`tooling/desk`). Do
not build it under `.ai/`: a workspace gets full lint, typecheck, test, knip, and
boundary checks. The `./contracts` export is browser-safe (Zod only). One engine
serves the CLI now and a React desk later. The desk is local developer tooling. It
is never mounted in `apps/api`.

Agents use tools inside a git worktree. The engine owns every command that has a
side effect or a pass/fail verdict: install, checks, commit, push, and PR creation.
Two gates stop for the owner: plan approval and PR review. Agents never commit,
push, merge, approve, or enable auto-merge. The desk never does either.

Isolation has two tiers. Host mode is the default. It is not a security boundary
against a prompt-injected builder that runs allowlisted repository scripts. Docker
mode closes that gap with no network and no credentials in the container (see
"Docker isolation").

State lives in `<git-common-dir>/kaine-desk/issues/<n>/`: `state.json` (Zod-validated,
schema-versioned, atomic writes), `events.jsonl`, and `artifacts/`. The Git common
directory is shared by all worktrees and is never committed. A per-issue lease file
stops two desk processes from driving the same issue.

GitHub Issues are the tracker. The desk uses `gh` through a port, so tests use
fakes. A run needs the owner. The latest `ready-for-agent` label event must come
from the configured owner, or the owner starts the run with `--override`. The
override is logged. Only OWNER, MEMBER, and COLLABORATOR comments enter prompts,
and the text is fenced as untrusted data. The desk stores a fingerprint of the
authorized text and checks it again before ship. GitHub write-back is best effort:
three mutually exclusive `agent:*` execution labels and one status comment, edited
in place. The desk never adds or removes `ready-for-agent` or another triage label.

Every agent stage runs through one function that checks the same invariants. The engine
compares HEAD, the branch, all refs, remotes, and the stash before and after each agent
run, and the worktree diff hash around each read-only role. It does this because a deny
rule can be bypassed (`git -C . commit` ran under a `git commit` deny). A violation
stops the issue in `needs-you` and is never silent. The allowlist for agents is narrow
and read-only for git. A recovered issue is never resumed by itself: `running` and
`queued` become `needs-you`, and the owner continues. The Codex builder stays disabled
until the config has an explicit opt-in, because Codex reports no permission denials and
its sandbox is coarser than a Claude allowlist.

The factory is frozen. After the first verified draft PR (Phase 3), the factory
controller, its UI, and its docs are removed. Its Docker assets move into the desk
for Phase 5. ADR 0010 is then marked superseded by this ADR.

## Consequences

Two tools exist until the factory is retired. The desk is not a replacement before
Phase 3. Host mode trusts the repository scripts that the builder may run. The
`agent:*` labels are repository state: create them once with
`pnpm desk labels sync --apply`. The owner reviews and merges every PR manually.
Every phase ships as its own draft PR.

## Ship

The engine ships, never an agent. The ship step runs only from `pr-review`, only after an
explicit confirmation (`--confirm`, a prompt on a terminal, or the `confirm` field of the
API), and only when the ship gate passes. The gate fails closed: it needs a check report for
the exact diff, a review of the same code, the owner identity, a still-valid authorization
snapshot, and a refs baseline. The engine records the refs baseline after every agent stage.
The commit goes through the repository hooks, the push goes through the pre-push hook, and
the PR is a draft. The desk uses no `--no-verify` and no force push. It never merges,
approves, or enables auto-merge. A failure after the first change goes to `needs-you` at
`ship`, and `continue` resumes it without a second commit or PR.

## Dashboard server (API)

The desk has a local HTTP server for the React desk (Phase 4). It lives in
`tooling/desk/src/server` and runs the same `PipelineRunner` as the CLI, so both
front ends share one engine and one lease per issue. The wire types and the flow
graph model are in `@repo/desk/contracts` (browser-safe, Zod only). The routes are in
[agent-desk-api.md](../agents/agent-desk-api.md).

The server reuses the security model of the factory dashboard (ADR 0010): a loopback
listener on a random port, an `HttpOnly; SameSite=Strict` cookie, Host and Origin checks,
a custom header on every write, a strict CSP, and artifacts that a client names by id
and never by path. Opening the built UI at the local URL issues the cookie. The one-use
launch token remains available for the separate Vite development origin. The
desk adds server-sent events (a runner listener plus a store comparison for changes
from a CLI run in another terminal) and one running action for each issue. `cancel`
and `remove` may run beside it, because they stop it. The server is never mounted in
`apps/api`. It does not cancel running actions when it stops: the next start marks
them `needs-you`.

## Dashboard (React desk)

The UI is the private `@repo/desk-ui` workspace (`tooling/desk-ui`). It is local developer
tooling and talks only to `pnpm desk serve`. It imports the wire types and the flow model
through `@repo/desk/contracts`, so the engine and the page share one definition of the stages.
The page has no polling: it loads the issue list, listens to the event stream, and loads the
list again after every reconnect.

The flow graph uses React Flow (`@xyflow/react`). The model decides every position and status
(`buildFlowModel`), and React Flow only draws it: fixed positions, no dragging, no connecting,
no layout library. The package pulls `zustand` 4 as its own nested dependency. The repository
uses `zustand` 5. The two do not share a module, and no alignment rule forbids it. Other graph
libraries stay out. The plan and the review are structured JSON and render as components, so
the page needs no Markdown library and shows no raw HTML. Colors come only from `--ds-*`
tokens, including the React Flow variables. Strings live in the `desk` translation namespace
(English, German, Serbian). The ship dialog runs the dry run first and asks a second time
before it sends `confirm: true`. The desk still never merges, approves, or turns on auto-merge.

## Docker isolation

An issue can run in Docker mode (`desk start <n> --isolation docker`, or `isolation: "docker"`
in the config). The choice is stored in the issue state. One seam decides it: the pipeline asks
an `IsolationPort` (`src/isolation`) for the runner of each agent stage and for the check run.
Host mode returns today's behaviour. Docker mode runs the builder and the check steps in
containers. The planner and the reviewer run no repository code and stay on the host. Setup and
ship stay on the host, because they run trusted code from `origin/main` and the commit and push
need the owner's identity.

The host worktree stays canonical. The volume holds a copy: the base commit arrives as a
`git bundle`, the work in progress as `git diff --binary`, and the result comes back as a
size-capped patch that the host checks and applies with `git apply`. The check refuses protected
paths (the same list as the host scope check), `.git`, symbolic links, and submodules, and it
compares diff hashes on both sides. The existing host invariants (refs, scope, diff hash) then
run as in host mode. No path of the worktree is bind-mounted.

Every container has `--network none`, a read-only root, no capabilities, `no-new-privileges`, a
non-root user, and limits. The one exception is a proxy container, which tunnels HTTPS CONNECT
to an allowlist: the provider hosts for agents, and `registry.npmjs.org` for the dependency
fetch. Dependencies are fetched through that proxy and installed offline in a container. The
host `node_modules` is never copied. Logins live in per-provider labelled volumes, created by a
login flow that runs in a container with a terminal. API keys enter a container only when the
config lists them by name.

Codex cannot run its own sandbox inside a container, and the container is the sandbox. The Codex
runner emits `--dangerously-bypass-approvals-and-sandbox` only for a builder, only when the request
asks for `containerSandbox`, and only when the Docker isolation built the runner. A host runner
refuses such a request, and the host tests assert that it never emits the flag.

Every Docker resource has the label `kaine-desk=1` and the name prefix `kaine-desk-`. Cleanup
selects by label, checks the prefix again, and verifies by listing. `remove` and crash recovery
clean the resources of the issue. `desk docker prune` cleans by issue, or everything after
`--all --yes`.

Consequences: the image is about 2 GB and is rebuilt on purpose (`desk docker build`). The first
run of an issue is slower than on the host. No MCP server and no browser run in a container. Ship
checks still run on the host. Real-Docker tests are gated by `DESK_DOCKER=1`. A model run in a
container needs a provider login, so it is verified by the owner with the checklist in
[agent-desk.md](../agents/agent-desk.md).
