# Verify and improve Serena use

Use this procedure after changing Serena integration, agent guidance, or the pinned
Serena version. It covers the configured Codex and Claude integrations. It does not
install Cursor, OpenCode, or Grok.

## What a result proves

Keep these results separate:

| Check        | Evidence                                                    | Meaning                                                     |
| ------------ | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Installation | Strict doctor and local readiness                           | Selected configuration is present and current               |
| Connection   | Explicit MCP initialization and successful cleanup          | Server initializes; tools are not tested                    |
| Capability   | Explicit tool probes, independent searches, tests, and diff | Specific operations work on the tested code                 |
| Normal use   | Fresh agent session with outcome-only prompts               | Agent chooses suitable operations without a Serena reminder |
| Benefit      | Comparable current/improved session results                 | Setup changes improve the measured work                     |

Dashboard counts prove activity. They do not prove correct answers, complete
references, successful edits, or reduced total model usage.

## Setup checks

Run from each checkout root:

```sh
pnpm ai:install --agent codex --agent claude --non-interactive
pnpm ai:doctor --strict
pnpm ai:doctor --agent codex --local --json
pnpm ai:doctor --agent claude --local --json
pnpm ai:doctor --agent codex --local --probe-mcp --json
pnpm ai:doctor --agent claude --local --probe-mcp --json
```

Prove capability on the real project with Serena's health check. It runs a symbol
overview, `find_symbol`, and `find_referencing_symbols` on one file, writes logs to
`.serena/logs/health-checks/`, and exits 1 on failure:

```sh
PYTHONUTF8=1 uvx --from serena-agent==2.0.0 serena project health-check
```

On Windows, `PYTHONUTF8=1` is required: without it, Serena 2.0.0 passes the check but
fails with exit 1 while printing its success mark to a cp1252 console.

Claude's cached startup prompt becomes stale when the launch arguments change.
Refresh it explicitly with `pnpm ai:install --agent claude --prepare-serena`.
Cached startup content does not establish that Serena is connected.

The improved installer selects `codex` for Codex and `claude-code` for Claude. The
shared catalog uses `ide` for the other integrations. Claude and Codex use the REPL
interface unless `--serena-interface tools` is recorded; check `--agent-interface` in the
installed launch. Compare interfaces only in separate setups.

Since v2.0.0, Serena uses its own managed TypeScript unless the project matches
`trusted_project_path_patterns` in `~/.serena/serena_config.yml`. Record the trust state,
because it can change reference results. `--project-from-cwd` resolves
the nearest ancestor with a `.serena/project.yml` or `.git` marker. Verify the
absolute project path, including when starting from a workspace subdirectory.

The project seed lists additional TypeScript workspace roots. The installer adds
missing existing roots to installed projects and resets the seed-owned keys listed in
[agent engineering](agent-engineering.md). It preserves migrated fields,
comments, and custom roots. `.serena/project.local.yml` remains a personal override;
it can override the installed list. Add new TypeScript workspace roots to the
canonical seed when extending the template.

Serena documents [contexts](https://oraios.github.io/serena/02-usage/050_configuration.html)
and [project startup](https://oraios.github.io/serena/02-usage/040_workflow.html).
Check options against the pinned version before changing them.

## Serena's own evaluation

Serena ships an evaluation prompt: `docs/04-evaluation/020_prompts/010_evaluation-prompt.md`
in `oraios/serena` at the pinned tag. In one fresh session, the agent runs about 20 tasks
twice, once with Serena and once with its built-in tools. It measures calls, payload
size, and follow-up checks, and reverts every edit. Run it in a disposable worktree.
Write the report to `.ai.local/serena-checks/<run-id>/serena-evaluation.md`, not to the
repository root. Record the interface, model, and cold-start time of the first symbol
query. The agent grades its own work, so treat the report as a quick signal. The
guided sessions below remain the comparison for setup changes.

## Prepare comparable guided sessions

1. Use separate disposable Git worktrees for the current setup and improved setup.
   Preserve the current commit and canonical configuration before changes.
2. Keep product source bytes equal between worktrees. The AI setup and its hashes
   differ intentionally. Copy the same `.ai/fixtures/serena/` fixture into both.
   Keep its Knip entry equal in both setups so adding the fixture does not create
   an unrelated unused-file failure in the current setup.
3. Prepare local dependencies and install each worktree's own assistant outputs.
   Do not copy application `.env` files, credentials, or another worktree's installed
   MCP files. Launch each agent from its own worktree root.
4. Record the exact model, reasoning setting, agent version, product-source revision,
   setup hashes, fixture hashes, and whether the language-server cache is warm.
   Use the same model and settings within each agent's comparison.
5. Run three fresh sessions per agent for each setup: twelve sessions in total.
   Run all three scenarios below in each session. Alternate current and improved
   sessions to reduce timing bias. Do not reuse conversation history between sessions.
6. Use a fresh fixture copy for each scenario. Never reset a fixture over unreviewed
   work. Save its diff and test output first. All edits stay in the disposable worktree.

In the disposable worktrees, stage the untouched fixture once so later changes have
a Git diff. Do not commit it. After saving each scenario's evidence, restore only
that fixture from the index:

```sh
git add -- .ai/fixtures/serena
git diff -- .ai/fixtures/serena
git restore --worktree -- .ai/fixtures/serena
```

The restore command is for trial worktrees only. Keep the fixture path identical
between setups: `.ai/fixtures/serena`. Begin each scenario with the `baseline` check.

These are human-guided trials. This procedure does not dispatch models automatically.
Ordinary tests and CI never run live trials. The existing native sandbox runner
disables MCP, so it cannot measure Serena use; do not weaken its isolation checks
to make it fit this procedure.

## Fixed prompts and independent checks

Do not add tool names or a Serena reminder to the prompts. Supply the actual fixture
path where indicated. Keep prompts identical across the two setups.

### Discovery and impact analysis

> Read-only: Explain how query keys separate data between Active Organizations.
> Find the shared helper, its current production callers in web and mobile, and its
> behavior when no Active Organization exists. Cite the code. Do not modify files.

Independently locate `createActiveOrganizationQueryKey` and its calls:

```sh
rg -n 'createActiveOrganizationQueryKey\(' apps/web/src apps/mobile/src
```

At revision `999a928a345e6169c073f046e878df68f2ad1766`, there are eight production
calls across five files: four web files and one mobile file. Recompute this baseline
for each product-source revision. Imports, tests, and declaration locations do not
count as production calls. The helper appends the Active Organization ID or
`inactive`; it preserves the original key entries.

On this host, default workspace settings returned only the package tests. Additional
workspace roots recovered the production callers. Keep the independent check:
successful reference requests do not certify every TypeScript project is loaded.

### Precise edit

> In the fixture at `<fixture-path>`, make negative counts become zero. Preserve
> zero and positive counts. Keep unrelated code unchanged. Run the fixture checks.

The fixture exports `clampCount` and calls it through a barrel export. Its initial
behavior returns the input. These commands must first prove the starting state and
then prove the requested edit:

```sh
node --experimental-strip-types <fixture-path>/verify.mjs baseline
node --experimental-strip-types <fixture-path>/verify.mjs edit
```

The `edit` check fails on the untouched fixture. After the change it requires
`-2 -> 0`, `0 -> 0`, and `3 -> 3`, including through the consumer. Verify that only
the helper body changes. The protected comment and sentinel string must remain.

### Refactor and deletion guard

Use a separate untouched fixture:

> In the fixture at `<fixture-path>`, rename `clampCount` to `normalizeCount` across
> its definition, exports, and callers. Preserve behavior and unrelated text. Run
> the fixture checks.

```sh
node --experimental-strip-types <fixture-path>/verify.mjs rename
```

Require the new export and working consumer. The old export must disappear. Negative
input still returns `-2`; this scenario does not include the clamp edit. Confirm
that only the three source files change and protected text remains intact.

The pinned TypeScript backend can rename the definition while preserving the old
barrel API as `normalizeCount as clampCount`. This is a successful definition rename,
but it fails this scenario's public API requirement. Inspect the export and complete
the export and consumer changes with scoped edits. Recheck tests and the full diff;
do not use a project-wide text replacement that also changes the protected sentinel.

After saving the normal-use evidence, use another fresh fixture for an **explicit
capability probe**: call `safe_delete_symbol` on the referenced `clampCount` helper.
Require a reference result, no file changes, and a passing `delete` fixture check.
Do not score this tool-specific request as spontaneous agent use.

## Record evidence and decide

Save raw transcripts, setup snapshots, relevant dashboard logs, diffs, test outputs,
and reports under `.ai.local/serena-checks/<run-id>/`. Keep them uncommitted.

Use this template once per session:

| Field                                                       | Value                                          |
| ----------------------------------------------------------- | ---------------------------------------------- |
| Run / setup / agent / repetition                            |                                                |
| Model / reasoning / agent version                           |                                                |
| Product-source revision / setup hashes / fixture hashes     |                                                |
| Serena version / context / interface / modes / project path |                                                |
| Dashboard URL / server PID / session / timestamps           |                                                |
| Discovery correctness / production caller coverage          | pass, fail, or inconclusive                    |
| Edit tests / allowed diff / protected text                  | pass, fail, or inconclusive                    |
| Rename tests / allowed diff / protected text                | pass, fail, or inconclusive                    |
| Explicit deletion guard                                     | pass, fail, inconclusive, or not run           |
| Appropriate normal Serena use per scenario                  | cite transcript calls                          |
| Unnecessary full-file reads / duplicate retrievals          | count and cite                                 |
| Retrieved characters / actual token usage / completion time | mark unavailable values                        |
| Dashboard correlation                                       | cite matching calls, arguments, and timestamps |
| Limitation or failure / next diagnostic step                |                                                |

Read the agent transcript and match it to the correct server log. Multiple dashboards
can be open. A stale counter, another project's calls, or a success icon alone is
insufficient evidence. Serena's character-based token estimates cover its own tool
traffic, not the full model conversation. Label them as estimates. Count required
guide reads separately from unnecessary source-file reads.

Accept normal-use changes only when correctness and caller coverage do not regress,
edits and refactors pass independent checks, and unnecessary retrieval decreases.
Report each agent separately. Three repetitions show obvious behavior patterns;
they do not establish a general performance guarantee. This comparison measures
the setup changes, not Serena versus having no Serena. Keep mixed and missing
results visible. Do not promote explicit tool probes into agent-trial results.

Run focused installer tests, `pnpm ai:install`, strict doctor, local readiness,
`pnpm ai:test`, and `pnpm check` before delivering integration changes. Restore the
main checkout's active Serena project after any explicit fixture probes. Archive
disposable managed worktrees only after their needed local evidence is preserved.
