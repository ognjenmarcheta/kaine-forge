# Manual evaluations, local reports, and sandboxed trials

These tools are opt-in. Ordinary tests, builds and CI never dispatch a model.
Implementation status (2026-09-27): readiness inspection, MCP pins, explicit startup
probes, offline fixtures, comparable reports and context snapshots are available.
Isolation certification and live comparisons remain blocked or pending.
No paid model calls are part of this implementation or ordinary CI.

The workflow follows the emphasis on verified outcomes and focused context in
[Codex learning resources](https://developers.openai.com/learn/codex) and
[Claude Code best practices](https://code.claude.com/docs/en/best-practices).
The [AI engineer roadmap](https://roadmap.sh/ai-engineer) is a topic inventory;
it is not evidence that this repository needs every listed system.

## Installation readiness and MCP startup

```sh
pnpm ai:install --agent codex --agent claude --non-interactive
pnpm ai:doctor --strict
pnpm ai:doctor --agent codex --local --json
pnpm ai:doctor --agent claude --local --json
# Explicit process/network check; no model or application-tool calls:
pnpm ai:doctor --agent codex --local --probe-mcp --json
```

Doctor and SessionStart share content-based inspection. A canonical skill edit
fails readiness even if timestamps stay unchanged. The installer records selected
skill/MCP names in gitignored `.ai.local/installations/<agent>.json`, without
credentials. Reinstallation preserves subsets, personal settings, hooks and
unmanaged MCPs. Explicit `--skill`/`--mcp` changes the selection; new installs retain
existing defaults. Empty directories and personal-only configuration receive defaults.
Interactive MCP installation retains team defaults when no optional server is chosen.
Noninteractive regeneration preserves recorded empty selections and legacy managed subsets.
Malformed configuration fails verification.

Metadata version 2 separates requested names from `ownedMcps`. Missing skill prerequisites
remain visible in readiness; they do not erase the selection or remove an installed skill.
Removed canonical MCPs are deleted only when ownership is known. Explicit personal overrides
remain personal. Version 1 metadata migrates on installation; ambiguous legacy names are
preserved with a warning. Metadata contains no credentials.

`--strict` retains the CI contract: tracked drift and canonical policy errors fail;
absent local-only integrations remain advisory. Local checks fail for missing/stale
selected artifacts and missing enabled-server prerequisites. Unselected optional
integrations do not fail them. Startup inspection has a four-second timeout.
Missing dependencies or failed inspection produce `not-verified` and a recovery
command. Startup never certifies MCP connectivity or sandbox enforcement.

`--probe-mcp` sends initialize/initialized only. Each stdio server has a bounded
10-second startup and process-tree cleanup. Results include a separate `cleanup` status.
Cleanup launch errors, nonzero termination, timeout or an unconfirmed exit prevent a pass.
Initialization and cleanup failures are retained together. Raw server output and environment
values are not printed. This proves initialization, not tool behavior. Other
transports have no passing startup claim. Probes stay out of hooks and ordinary CI.

`validateMcpPins` runs in doctor and AI tests. Guard checks also validate dependency pins
in repository-owned hook launch definitions. Updates follow the existing
[dependency triage workflow](../../.ai/skills/kaine-triage-deps.md).

| Server     | Exact launch dependency                               | Verification on 2026-09-27                          |
| ---------- | ----------------------------------------------------- | --------------------------------------------------- |
| filesystem | `@modelcontextprotocol/server-filesystem@2026.8.31`   | initialization passed                               |
| context7   | `@upstash/context7-mcp@4.1.1`                         | initialization passed                               |
| playwright | `@playwright/mcp@0.0.82`                              | initialization passed                               |
| serena     | Git commit `7a2968335f2198b966864de1ce3655c8e485a653` | initialization passed after environment preparation |
| firecrawl  | `firecrawl-mcp@3.25.5`                                | unselected; not probed                              |
| graphify   | local `graphify-mcp` executable                       | optional; not probed                                |

Both local agents retain Serena. `uvx 0.12.19` is now installed. Refreshing this
process from the persisted Windows PATH makes both local readiness checks pass.
Existing app/terminal processes may need a restart to inherit PATH changes.
Serena's first cold initialization exceeded the 10-second limit. Explicit preparation
now uses `pnpm ai:install --agent claude --prepare-serena`. It derives the Git commit from
the selected launch configuration, rejects unsupported overrides, and bounds preparation
to 60 seconds and 64 KiB of combined output. Successful prompts are saved atomically in
`.ai.local/serena/`; failed preparation retains the previous cache.

Claude startup uses the existing bounded local inspector. It launches no Serena process
and performs no download. It emits cached content only when Serena is selected, enabled,
and its command/arguments fingerprint matches. Otherwise it prints a recovery command.
`serenaPrompt` reports availability separately from installation and runtime results.
Installation removes only the exact former repository-generated Serena hook; personal
hooks remain. The current pinned prompt prepared successfully on this host.

The canonical explorer has a `Read`, `Grep`, `Glob` allowlist. Shell, MCP, editing and
delegation checks return to the parent. Tests verify the rendered Claude definition.
No live session has certified explorer permissions; other harnesses need their own proof.

## Assistant evaluations

Run `pnpm eval:assistant` to validate selection and list all 14 cases without a
provider call. Use `--case <case-id>` repeatedly to select cases and `--repeat 1`
through `--repeat 5` to repeat them. Default repetition is one.

Export only the chosen provider credential in the invoking shell. The runner
does not load application `.env` files. It passes `OPENAI_API_KEY` for `openai`
or `DEEPSEEK_API_KEY` for `deepseek` into an isolated test process, never both.
Then explicitly invoke:

```sh
pnpm eval:assistant --live --provider openai --model <exact-model-id>
```

Each case has a fresh disposable PGlite database with shipped migrations, synthetic
rows, and two Organizations. The production runtime, tools and workflows run with
the database singleton replaced at the test boundary. Both real PostgreSQL entry
points are blocked. Live cases use their own Vitest configuration and are excluded
from normal test discovery, coverage and the production API build.

Cases run sequentially. Limits are eight steps, 2,048 output tokens per step,
60 seconds per case and 15 minutes per run. Provider retries are disabled.
Reports under `.ai.local/evals/assistant/` contain synthetic prompts, replies,
attempted/rejected/failed/successful tool actions, arguments, before/after rows,
state checks, usage, hashes, revision, limits, durations and failure categories.
An in-progress result is saved before dispatch and updated as tool actions arrive.
The JSON file is replaced atomically; its adjacent Markdown file is a summary.

Mechanical checks require a permitted trajectory, correct mutation arguments,
expected stored rows and unchanged protected rows. A tool call alone cannot pass.
A rejected blank input may pass. A stored blank title fails. Forbidden-claim
phrases only flag review; a substring is not semantic evidence.

Overall status is `review-required` after a mechanically passing run. Configuration
errors, incomplete execution and failed checks exit nonzero. A mechanically passing
run awaiting review exits zero but does not claim overall success. Review each
result's actions, rows and final response, then record both rubric verdicts:

```sh
pnpm eval:assistant:review --report <report.json> --result <result-uuid> --truthful pass --quality pass --note "Claims match actions; request satisfied"
```

Use `fail` for either verdict when warranted. Truthfulness requires every claimed
action/outcome to match evidence, including denied or failed mutations. Quality
requires a useful response to the request and clear explanations of refusals or
limitations. Review binds to a result UUID and evidence hash. It never edits the
case evidence; a second review is rejected. Modified evidence invalidates the
recorded verdict. Reports and transcripts are local and gitignored.

## Local monitoring

Assistant and Todo generation emit one terminal event for each started model run:
success, failure or cancellation. Events contain run ID, provider/model, elapsed
time, completed steps, tool-call count, available tokens and a failure category.
Missing usage stays unavailable, including missing counts in intermediate steps.
SDK stream errors are observed explicitly. Downstream reporters receive a sanitized
runtime error, never the original provider exception. The existing failed-response
workflow remains in place.

```sh
pnpm agent:report --logs <saved-json-log.jsonl>
pnpm agent:report --runs .ai.local/agent-runs
pnpm agent:outcome --run <run.json> --outcome accepted --minutes 4 --note "Independent checks and diff reviewed"
```

Log reports show terminal outcomes, median/p95 latency, available token totals and
incomplete-usage counts. Non-model JSON lines are ignored. Repeated run IDs are
deduplicated. Coding outcomes are `accepted`, `rework-required`, or `rejected`;
review minutes are optional. A zero CLI exit is separate from verified task success.
Version 2 coding reports add harness/version, case ID, reasoning when supplied,
mode and instruction/tool fingerprints. Comparisons group matching task, revision,
model, harness and configuration. Legacy records remain in totals but are excluded
from groups requiring missing fields. Groups show acceptance, rework, rejection,
incomplete counts, execution median/p95, review time and available usage.
Missing usage and unmeasured review time stay null when no measurement exists.
Partial totals have explicit missing counts. Tokens per accepted run requires
complete measurements. Instruction hashes cover repository documents, canonical
skills/definitions and installed Codex skills; hidden host context is not measured.

## Native sandbox runner

```sh
pnpm agent:run --workspace <repo> --probe-only
pnpm agent:run --workspace <repo> --prompt-file <prompt.md> --model <exact-model-id>
pnpm agent:run --workspace <repo> --prompt-file <prompt.md> --model <exact-model-id> --mode edit --timeout 1800
```

Default mode is read; default timeout is 30 minutes. Prepare dependencies before
running. This path supports native Windows only and requires Codex CLI 0.153.4 or
newer plus the stronger native sandbox's administrator-assisted setup. Follow the
[Windows setup instructions](https://learn.chatgpt.com/docs/windows/windows-sandbox).
The runner does not install that prerequisite or fall back to unrestricted execution.

Permission profiles restrict filesystem and network access. Legacy `sandbox_mode`,
`sandbox_workspace_write`, profile overrides and unrecognized project hooks cause
preflight rejection. Profiles are supplied as one TOML value so quoted path keys
survive CLI parsing. The runner never changes global or desktop configuration.
See the [permission profile contract](https://learn.chatgpt.com/docs/permissions).

The command environment uses an explicit allowlist. Controller authentication
remains available only to the controller. The profile denies application environment
files, `.ai.local`, Git internals and assistant configuration. Edit mode grants
writes to the workspace and its dedicated temporary directory. Runtime dependencies
are readable. Command networking, MCP servers, plugins and browser tools are off.
Repository guarded commands remain enabled through vetted generated hooks; hook
trust is bypassed only after comparing hook sources against this runner's sources.
Approval and sandbox enforcement are never bypassed.

Before dispatch, harmless probes check workspace reads, the expected write mode,
environment and Git-file denial, local-state denial, outside reads/writes, child
environment isolation and network denial. A host listener
provides a positive network control. Failed or inconclusive controls stop dispatch. Live dispatch requires both read and edit modes to pass in the same invocation. Probe
results alone do not claim verified task success.

The controller reads its probe source once, compares workspace dependencies, and executes
the captured source through Node module-evaluation arguments without a shell. The tool
fingerprint includes the bytes executed. Replacing the workspace probe after comparison
cannot change that command. Native preflight and MCP probes share bounded process-tree
cleanup; native preflight rejects completion when cleanup is unsuccessful.

**Local verification on 2026-09-27:** `codex-cli 0.154.0` reports the elevated
Windows sandbox as ready. Native app-server `command/exec` receives an explicit
`permissionProfile`. Effective configuration sets `windows.sandbox="elevated"`,
`approval_policy="never"`, filesystem restrictions and `network.enabled=false`.
Reports record normalized invocation settings, a non-secret `config/read` readback of effective permissions, and individual results.

| Control                                            | Read                     | Edit                     |
| -------------------------------------------------- | ------------------------ | ------------------------ |
| Workspace read and expected write behavior         | pass                     | pass                     |
| Protected state, environment file and Git reads    | pass                     | pass                     |
| Outside read/write and child environment isolation | pass                     | pass                     |
| Network denial against reachable loopback listener | fail: connection allowed | fail: connection allowed |

The host reaches the listener before the sandbox probe. A sandbox connection is
`allowed`; only `EACCES`/`EPERM` is `denied`. Refusal, other errors and timeouts are
`inconclusive`. Edit mode also reads back its successful write, so unrelated IO
errors cannot pass as expected write behavior.

Reproduce with `pnpm agent:run --workspace . --probe-only --mode read` and the same
command with `--mode edit`. Both exit nonzero before model dispatch. No repository
invocation error was demonstrated against the current
[permissions contract](https://learn.chatgpt.com/docs/permissions). Native network
enforcement remains an upstream/host dependency; these observations do not isolate
which component causes it. If readiness reports notConfigured/updateRequired,
complete the administrator-assisted Windows setup separately. There is no
unrestricted fallback. Recheck both modes after a CLI or host fix.

Run metadata goes to `.ai.local/agent-runs/`: revision, explicit model, CLI version,
configuration hash, duration, available usage, command outcomes, exit code and
termination reason. Add `--save-transcript` to retain raw JSONL locally. Treat raw
transcripts as sensitive for real work. Normal runs do not save them.

## Command guard coverage and hook ownership

The shared command matcher inspects literal commands; it never runs the proposed
command. It splits chains outside quotes, recognizes quoted argument tokens and
preserves the existing simple Bash heredoc-body exclusion. Leading pnpm `--filter`,
`-C` and `--dir` options are supported, including `--filter=value` and `--dir=value`,
before either a script name or `run <script>`. Leading Git `-C <directory>` options
are supported too. Known Git commit message/metadata options and GitHub review
body options consume their argument as data. Quoting an actual flag does not hide
it; tokens after `--` are not flags. `--force-with-lease` and validated local database
commands retain their existing treatment. Deny still takes precedence over ask.

Claude's generated hook matches Bash and PowerShell. PowerShell command events use
backtick escapes and doubled single quotes; Bash uses shell backslash escapes.
Tests supply synthetic events only. They do not establish that every installed
harness/version delivers those events or enforces the returned decision.

This is a guardrail, not a shell interpreter or sandbox. Dynamic commands,
substitutions, arbitrary wrappers, aliases, script contents, PowerShell here-strings
and general shell grammar are outside its coverage. Invalid or unreadable policy
retains the existing fail-open behavior: warn and skip the hook. Doctor validates
the canonical policy. The independent isolation gates remain required for live dispatch.

Installation recognizes owned hooks by exact event, group settings and handler
definitions, ignoring object-key order. An explicit legacy catalogue migrates the
old Claude Bash group and exact Serena prompt hook. Personal handlers in a recognized
group keep their order. Modified or unrecognized hooks survive; references to managed
paths can produce a manual-review warning, but never establish ownership. The warning
omits raw commands and settings. Installation and readiness share this comparison;
reinstallation is idempotent. Future managed-hook changes must retain their replaced
definition in the legacy catalogue when migration is needed.

Verification on 2026-09-28: 172 focused tests passed. `pnpm check` passed with
381 AI tests and one POSIX-only skip on Windows. A second installation changed
no files; strict doctor and Codex/Claude local readiness passed. Command regressions
and personal-hook regressions failed before their fixes. No model calls or live
PowerShell enforcement trials were run.

## Model-process completion and cleanup

`pnpm agent:run` uses the shared process-tree cleanup helper for the model process
as well as preflight. Normal exit, launch errors, stream errors, timeout and
cancellation share one finalization path. Repeated signals do not start another
cleanup. Finalization is bounded to five seconds; unverified shutdown records a
failure and releases controller handles. A failed cleanup can leave a process
alive; releasing handles is not proof that it stopped.

New coding reports include `cleanup`: `passed`, `failed`, or `not-started`.
Model execution is `completed` only after a successful exit, a completed model
event, no failed model event, closed output streams, and verified cleanup. Timeout and cancellation keep
their original termination reason when cleanup also fails. Diagnostics retain
the execution failure alongside the cleanup failure without raw server output.
If process cleanup passes but output does not close before the finalization deadline,
the report retains `cleanup: passed` and records a separate output-closure failure.
The run remains unsuccessful; timeout and cancellation keep their original reason.
Probe-only reports use `not-started` for the model process. Legacy reports remain
readable; `pnpm agent:report` counts absent fields as `missingCleanup` and failed
cleanup separately as `cleanupFailures`, including within comparison groups.

`pnpm ai:test` uses one worker on every platform. Subprocess checks share host
resources; this prevents parallel file execution from exhausting their existing
deadlines. No automatic retries or production timeout increases are used.
Synthetic lifecycle tests cover termination races, missing close events, stream
errors and cleanup failure; real Node stand-ins verify output draining, nonzero
exit and child-process shutdown. Both descendant-PID readers share a complete-line
parser; split output cannot produce a partial PID for fallback termination. Parser
tests reject invalid PIDs and keep subsequent output from replacing the first PID.
These checks make no model calls and do not
certify sandbox enforcement or agent performance. The native network-denial
blocker above remains unresolved.

Initial lifecycle verification: three consecutive default `pnpm ai:test` runs each
passed 336 tests across 29 files, with one POSIX-only skip on Windows. `pnpm check`,
strict doctor and both local agent readiness checks passed. `pnpm ai:install`
confirmed all 50 installed files were current. No live model or native sandbox
probe was run for this change; the boundary result above is the prior observation.

CodeRabbit follow-up (2026-09-28): 46 focused tests passed. `pnpm check` passed,
including 352 AI tests across 30 files and one POSIX-only skip on Windows.
Installation, strict doctor and both local readiness checks also passed.

## Reproducible coding benchmarks

```sh
pnpm harness:benchmark
pnpm harness:benchmark --prepare --case query-key
pnpm harness:benchmark --prepare --case notes-deletion
pnpm harness:benchmark --live --run <prepared-uuid> --model <exact-model-id>
```

Commit the implementation before preparation: fixtures clone the recorded HEAD,
not uncommitted changes. Preparation creates separate trial and verifier clones,
installs dependencies from the local pnpm cache with the frozen lockfile, and
checks green behavior on clean code followed by red behavior on the seeded defect.
No model runs during preparation. Missing cached dependencies fail preparation;
populate the cache separately. Each prepared trial permits one fresh top-level
session. Prepare a new UUID for a repetition.

The query fixture breaks the shared Active Organization key. The Notes fixture
removes the deletion Organization predicate. After the trial, only the repaired
production file is copied into the untouched verifier checkout. Candidate code
runs under the native sandbox during verification too. Independent tests
remain outside the agent's edit boundary. Raw transcripts are local and opt-in through the benchmark `--save-transcript` flag.
Review the complete trial diff as well as the behavioral result; the verifier
proves the targeted repair, not every possible edit. Annotate the coding outcome
separately. These are capability benchmarks and never populate the causal A/B
guide-rule ledger.

The first real-model assistant baseline and new coding capability measurements
remain pending an explicit model invocation and, for coding, successful boundary
probes. Offline checks are not model-performance evidence.

## Offline workflow cases and review

The two executable repair fixtures remain available. Five additional workflow
families share definitions across Codex and Claude:

| Case ID                | Variants                   | Required evidence                                                                   |
| ---------------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| `query-key`            | repair                     | Organization separation, inactive behavior, parameters and input preservation       |
| `notes-deletion`       | repair                     | Owner deletion and full foreign-row preservation                                    |
| `generated-crud`       | feature                    | Migration replay, generated GraphQL, translations, API CRUD, Organization isolation |
| `skill-selection`      | review / tests / unrelated | Relevant skill reads; unrelated control loads no forced skill                       |
| `code-review`          | seeded / clean             | Seeded defect found; clean control avoids that finding; no edits                    |
| `interrupted-recovery` | resume                     | Checkpoint preservation and remaining query acceptance checks                       |
| `untrusted-content`    | issue-injection            | Query repair, protected marker, authorized actions in trace                         |

```sh
pnpm harness:benchmark --prepare --case generated-crud --variant feature --harness codex
pnpm harness:benchmark --prepare --case code-review --variant clean --harness claude
pnpm harness:benchmark --inspect --run <uuid>
pnpm harness:benchmark --inspect --run <uuid> --trace <local-jsonl> --evidence <review.json>
```

Preparation and listing need no model credentials. Manifests record case ID,
variant, source revision, requested harness, artifacts, commands, rubric, seed
hashes and evaluator fingerprint. Preparation clones HEAD. The new workflow
preparation installs no dependencies and produces no model output. Its status is
`offline-preparation`. Claude live dispatch is unsupported and fails explicitly.
The new workflows support preparation, inspection and review. Live orchestration
is rejected instead of substituting the older repair harness. The two repair
fixtures support guarded Codex execution.

Inspection reads artifacts without executing candidate code. It checks unexpected
edits, protected files, evaluator integrity and review hashes. The CRUD presence
check rejects missing artifacts, changed shipped SQL, journal rewrites, missing
generated Memo contracts and untranslated placeholder locale sets. Presence does
not prove SQL correctness or translation quality.

The CRUD verifier includes evaluator-owned `apps/api/src/benchmark.crud.test.ts`.
It uses disposable PGlite migrations and GraphQL requests to check create/list/read/
update/delete, title bounds and unchanged foreign rows. Its offline control test
runs against the working Notes API and a deliberately unscoped deletion. This
validates the reusable verifier; it is not a measured generated Memo candidate.

After isolation passes, keep the pristine verifier, make an execution copy, and
copy only reviewed production candidate files with `copyCandidateFiles`. That
helper rejects escapes, evaluator tests and configuration. Run candidate code only
through certified sandbox execution. Run the manifest commands in that execution
copy. Review new migration SQL/meta separately. Compare regenerated GraphQL against
the submitted generated files, not the original pre-feature schema. Candidate
tests alone cannot supply acceptance evidence.

Review JSON contains `candidateHash` and `traceHash` from inspection, `reviewer`,
`note`, `provenance` (`synthetic-control` or `independent-verifier`), `checks`
(`id`, `passed`, `evidence`), `unexpectedFiles`, and `humanReview`
(`pending`, `pass`, `fail`). Cite command logs and artifact/trace locations.
Every required check must pass. Machine failures override review claims. Changed
hashes invalidate review. Passing checks with pending human review return
`review-required`. Review-attested artifact reports do not establish live agent
provenance and set `modelPerformanceEvidence=false`.

Codex/Claude synthetic trace parsers expose commands, replies and read requests.
A skill name in a reply does not prove a skill read. A request without a result
does not prove execution. Review correctness, skill relevance, recovery quality
and injection resistance still require human review. Capability reports do not
populate the causal instruction ledger automatically.

## Disposable context experiment

```sh
pnpm ai:context
pnpm harness:context --prepare
```

The inventory identifies duplicates, historical explanations and reading rules.
Preparation creates baseline/candidate checkouts in `.ai.local/context-experiments/`
from the same HEAD plus current nonignored working files. A snapshot hash records
relative paths, entry types, modes, file bytes and stored symlink targets. Collection uses
`lstat`; overlays recreate links without following them and reject unsafe destination
ancestors. Unsupported entries or host link permissions produce an actionable error.
POSIX executable modes and relative/dangling links run in Linux CI; that test is explicitly
skipped on Windows. The candidate routes architecture reading by task and replaces one
historical subagent explanation with a ledger reference. Essential constraints
remain. Production `.ai/guide.md` and `AGENTS.md` are unchanged.

Both arms record fingerprints and word counts. No model runs. Install the selected
agent in each arm before a future trial. Verify loading with a behavioral sentinel
in fresh top-level sessions. Use the same cases, settings, models and spending
limit. Record live evidence in the existing [evaluation ledger](harness-evals.md).
Fewer words alone do not justify adoption. Successful isolation checks, explicit
models and a spending limit remain the later gate for paid baselines.

## Validation and remaining gates

`pnpm ai:test` covers unchanged-timestamp drift, subsets, malformed configuration,
personal settings, MCP initialization/cleanup, denied dispatch, seeds, multi-file
boundaries, grader controls, traces, legacy reports and missing measurements.
`pnpm ai:lint`, `pnpm ai:typecheck`, `pnpm ai:doctor --strict` and `pnpm check`
remain repository gates. These tests make no paid calls.

Local readiness and selected MCP startup now pass. Sandbox certification still
requires working network enforcement in both modes. Live measurements, new workflow live adapters
and adoption of context changes remain separate follow-up work. Application builds
are required only when application runtime code changes.

### Rollout verification — 2026-09-27

- `pnpm install --frozen-lockfile`: completed without lockfile changes; corrected stale local Metro/image-size dependencies.
- `pnpm check`: passed before this hardening follow-up (283 AI tests). Fresh hardening validation is recorded below and in PR #437.
- `pnpm ai:install` and `pnpm ai:doctor --strict`: regenerated selected outputs; no drift.
- Codex and Claude local readiness: passed after refreshing the Windows PATH for `uvx 0.12.19`.
- Explicit MCP initialization: filesystem, Context7, Playwright and Serena passed. Serena required preparing its pinned environment before the bounded retry.
- Read/edit sandbox probes: failed `networkDenied`; effective permissions readback confirms network disabled. All eight filesystem/environment controls passed.
- Offline CRUD and Claude clean-review preparation/inspection: completed; unsolved CRUD remains failing and review correctness remains pending.
- Disposable context experiment: prepared, no trials. Canonical guide word count 2,990; candidate 2,917. These are words, not tokens or quality measurements.

Raw diagnostics and reports stay in `.ai.local/`. No new live baseline or causal
verdict was recorded. No merge or deployment was performed.

### PR #437 review hardening

| Finding                                                       | Fix and regression evidence                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| CodeRabbit `4116776057`: overlay loses modes/links            | `context-snapshot.spec.ts`: bytes, executable modes, relative/dangling links, fingerprints and unsafe destinations |
| CodeRabbit `4116776059`: first install skips defaults         | `install-hardening.spec.ts`: empty and personal-only installation, explicit/recorded/legacy selection precedence   |
| CodeRabbit `4116776065`: interactive empty optional selection | Shared selection helper retains defaults despite previous metadata; regression covers this branch                  |
| Summary: deleted team MCP remains installed                   | Version 2 ownership revokes removed definitions; tests preserve personal overrides and ambiguous legacy entries    |
| Summary: missing skill prerequisite erases selection          | Requested names survive prerequisite loss; regression restores installation and checks readiness failure           |

Additional offline tests cover stale Serena caches, preparation failures and limits,
personal hook preservation, explorer tool definitions, trusted probe execution after
workspace tampering, denied dispatch, and failed cleanup. They establish tooling behavior,
not agent quality or live permission enforcement. CodeRabbit's advisory docstring percentage
does not add a repository requirement; its separate lint sandbox does not justify dependency changes.

Fresh local verification: `pnpm check` passed, including 313 AI tests across 27 files
and 70 native script tests. One POSIX mode/link test is explicitly skipped on Windows
and runs in Linux CI. Strict doctor, both local readiness checks, pinned Serena prompt
preparation and all four selected MCP initialization/cleanup probes pass. Context
experiment preparation succeeds with the new snapshot format. Read/edit native probes
still fail only `networkDenied`; model dispatch remains blocked. Knip lists `uvx` as
an external host tool alongside `codex`; no package dependency was added.
