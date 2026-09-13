# Manual evaluations, local reports, and sandboxed trials

These tools are opt-in. Ordinary tests, builds and CI never dispatch a model.
Review the four changes in this order: assistant evaluation files; terminal telemetry
and local reports/fixtures; the native sandbox runner; the generated guide index.
The application schema, public GraphQL API, deployment and model selection remain unchanged.

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
No hosted service, price table or automatic model routing is added.

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
provides a positive network control. Any failed control stops dispatch. Probe
results alone do not claim verified task success.

**Local verification on 2026-09-12:** the stronger Windows sandbox reports
`ready`. The runner uses the native app-server `command/exec` endpoint with an
explicit `permissionProfile`, after a readiness check. The older `codex sandbox`
debug path failed protected reads; it is not used by the runner. Native filesystem
controls now pass, but the loopback network probe still succeeds despite network
access being disabled. Preflight therefore exits nonzero before model dispatch.
This boundary is not certified here. Resolve native network enforcement, then both
read and edit probes must pass. Do not weaken these assertions to enable a trial.

Run metadata goes to `.ai.local/agent-runs/`: revision, explicit model, CLI version,
configuration hash, duration, available usage, command outcomes, exit code and
termination reason. Add `--save-transcript` to retain raw JSONL locally. Treat raw
transcripts as sensitive for real work. Normal runs do not save them.

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
remain outside the agent's edit boundary. Full synthetic transcripts are retained.
Review the complete trial diff as well as the behavioral result; the verifier
proves the targeted repair, not every possible edit. Annotate the coding outcome
separately. These are capability benchmarks and never populate the causal A/B
guide-rule ledger.

The first real-model assistant baseline and new coding capability measurements
remain pending an explicit model invocation and, for coding, successful boundary
probes. Offline checks are not model-performance evidence.
