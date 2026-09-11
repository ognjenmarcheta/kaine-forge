# GPT-6 Astra readiness baseline

## Status — 2026-09-11

The CLI upgrade restored Astra access. **All three trials passed**, including
independent behavioral checks. All trials use fresh GPT-6 Astra sessions at high reasoning,
sequentially, in disposable checkouts. No trial feature or defect enters the
product checkout. Application provider and model settings remain unchanged.

This is a capability baseline, not a controlled comparison of instruction
quality. It does not add entries to the existing A/B harness ledger.

## Revisions and environment

- Product base: `31804e384456528785024fea34af49fc3ecb049e`.
- Prepared revision: `aab419adcd640accd11edc443a7fa31b49fd11c1`, committed only
  in the external experiment checkout. At evaluation time, the product changes
  were local and uncommitted on `codex/astra-readiness`.
- Model: `gpt-6-astra`; reasoning: `high`; CLI: `codex-cli 0.153.4`.
- Host: Windows, Node `25.7.0`, pnpm `10.29.3`; PostgreSQL is local.
- Each checkout receives `pnpm install --frozen-lockfile` and the repository's
  Codex skills plus filesystem, Context7, and Playwright configuration.
- CLI execution uses the existing signed-in account and personal configuration.
  Local unrestricted execution matches the authorized host environment. Prompts
  restrict writes to each disposable checkout and its dedicated database.
- Setup and independent evaluation time are excluded from model elapsed time.
  CLI token totals are cumulative across requests, not a context-window size.

| Trial                    | Fixture revision                           |  Elapsed | Input tokens | Cached input tokens | Output tokens | Reasoning output tokens | Outcome |
| ------------------------ | ------------------------------------------ | -------: | -----------: | ------------------: | ------------: | ----------------------: | ------- |
| Query-key bug fix        | `25548d8d300444c99998b6d0cf923d82a71a0067` | 132.81 s |      517,939 |             464,896 |         2,767 |                     179 | Pass    |
| Memo CRUD                | Prepared revision                          | 675.33 s |    3,186,565 |           3,066,880 |        15,145 |                   3,111 | Pass    |
| Notes deletion isolation | `1f02242984b9f0e759689b5148df4cdda5bf3309` | 151.42 s |      521,061 |             467,840 |         3,239 |                     430 | Pass    |

Cached input is included in reported input totals; reasoning output is a subset
of reported output. No substitute model was used.

## Trial results

### 1. Query-key bug fix — pass

The fixture replaces Active Organization identity with `"inactive"` in the shared
query-key helper. An inert `void` use keeps the deliberately disconnected
parameter lint-valid. The original tests fail on the seeded defect.

Astra restores `activeOrganizationId ?? "inactive"` in the shared helper. It
traces all seven callers: web/mobile Todos, Notes list/detail, Assistant
list/history, and Organization members. Table-driven tests prove Organization
separation, parameter preservation, input immutability, and inactive behavior.

- Independent `pnpm --filter @repo/query check`: **24 tests pass**, with lint,
  formatting, and typecheck passing.
- Changes: three files, including the required patch changeset; no unrelated
  changes found.
- Clarification stops: **0**.
- Verification accuracy: reported passing checks match the logs and independent
  check. Astra correctly reports that `pnpm check:affected` cannot run because
  the lightweight clone lacks `origin/main`; this is a harness limitation.

### 2. Memo CRUD — pass

Astra uses the feature generator for Memo/memos with API and web surfaces,
required title up to 255 characters, optional body, and English/German/Serbian
translations. GraphQL output is generated. Migration
`0010_condemned_loa.sql` adds the table, foreign keys, and Organization index.
Existing migration SQL and snapshots remain unchanged.

GraphQL/PGlite tests cover CRUD, title validation, authentication, membership,
and cross-Organization access. Browser tests cover CRUD and Organization
switching, including preserved foreign rows after denied mutation attempts.

- Independent Memo API tests: **26 pass** across four files.
- Independent Memo browser tests: **2 pass** with
  `API_RATE_LIMIT_ENABLED=false` for the test process only.
- Recorded agent checks: **227 API tests pass**, `pnpm check`, `pnpm run
build:core`, and repeat `pnpm generate` with no generated drift pass.
- Full browser suite: **9 pass** with the same test-process rate-limit override.
  The original run hits HTTP 429 after Memo CRUD succeeds. A second run exposes
  a test assumption about Organization selection after reload; Astra corrects
  the test and reruns focused and full suites. No rate-limit defaults change.
- Local schema preparation uses only `monorepo_astra_memos` through the validated
  commands. The product database is outside this trial.
- Changes: 46 files, 3,699 added / 5 removed lines; migration snapshot and generated
  GraphQL account for much of the size. No unrelated changes found. The Vitest
  validators alias supports the new test path. Mobile remains unchanged.
- Clarification stops: **0**.
- Verification accuracy: final claims match the command logs and independent
  checks; initial failures and the environment override are disclosed.

### 3. Notes deletion isolation — pass

The fixture removes the Organization predicate from Notes deletion. The existing
six tenancy tests still pass, demonstrating that the new proof must exercise
deletion. The trial requires owner deletion to succeed and a cross-Organization
delete to preserve the entire row, using the real GraphQL/PGlite pattern.

Astra traces the resolver and workflow, restores the missing predicate in the
adapter, and adds positive and negative deletion controls. It also strengthens
the existing cross-Organization update test to compare the full stored row.

- Independent tenancy tests: **8 pass**. Reapplying the seeded adapter makes the
  new cross-Organization delete test fail; restoring the repair makes it pass.
  The evaluator restores the final fixed file after this check.
- Independent full API suite: **203 tests pass across 36 files** with a
  process-local placeholder `DATABASE_URL` for import-time validation. Tests use
  the existing mocks/PGlite pattern; no external database is needed.
- Agent lint, typecheck, format, changeset formatting, and diff checks pass.
- Changes: three files, including an API patch changeset; no unrelated changes
  found. The update assertion addresses the requested unchanged-row guarantee.
- Clarification stops: **0**.
- Verification accuracy: the reported defect reproduction and passing checks
  match the transcripts and independent results. The missing import-time URL
  and unavailable `origin/main` comparison are accurately disclosed.

## Recommendation

GPT-6 Astra at `high` is a good fit for this repository's shared-helper repairs,
generator-based feature work, and Organization-scoping fixes. These three runs
finish without clarification stops and produce verifiable results. Keep the
canonical instructions, validated database commands, and behavioral tests in
the workflow. This small baseline supports that recommendation; it does not
establish performance on every feature or the causal benefit of each instruction.

## Setup and hook verification

- Dependencies restore with the frozen lockfile; the lockfile is unchanged.
- Bootstrap succeeds, including a fresh schema and seed. Repeating
  `pnpm db:prepare:local` preserves an existing Note (`1 → 1` rows).
- Web, API `/health`, and API `/ready` return HTTP 200. The original project's
  seven Chromium tests pass, including sign-in, Notes, and Organization isolation.
- `pnpm check` passes again after the CLI compatibility repair: formatting, lint,
  boundaries, typecheck, package tests, **235 AI tests**, **39 script tests**, Knip.
- `pnpm build:core` passes. `pnpm ai:doctor --strict` reports no drift; optional
  unconfigured MCP services retain advisory warnings.
- CLI `0.153.4` accepts the generated configuration with `--strict-config`.
  The canonical renderer now emits `features.hooks`, replacing the deprecated
  `features.codex_hooks` setting required by the previous CLI.
- Live testing exposed a Windows hook problem: an exit-code-only denial was not
  enforced through this CLI hook execution path. Codex now receives the structured
  `hookSpecificOutput.permissionDecision = "deny"` response with exit 0. Other
  agents retain their existing exit behavior.
- A harmless write probe with this structured response is blocked and its marker
  file is absent. The repaired repository guard blocks `pnpm db:push --help` in a
  live Astra session. The raw trial transcript also contains injected startup
  repository context. Presence of configuration alone is not treated as proof.
- The trials use `--dangerously-bypass-hook-trust` only for hook definitions vetted
  outside the CLI. It does not bypass command denials. Normal interactive CLI
  sessions must review and trust their current hook definitions through `/hooks`.
- The local database wrapper independently validates its target before spawning
  any mutation, regardless of agent hook trust. Raw `pnpm db:push` remains denied.

The previous CLI `0.118.0` rejected Astra with HTTP 400 before any coding trial.
Its evidence is retained separately. The new access probe returns `READY`.

## Evidence and reproduction

Evidence remains outside the product checkout:
`~/.codex/kaine-astra-readiness-20260911/retry-01534/`.

- `prepared.bundle`, `prepared-source.tar`, source file list, and prepared revision.
  The source archive SHA-256 is
  `9a8e013846f95a0f9b42828ad29bacaf8b3d4fa53799e31c9fbdc42378c22616`.
- Per-trial prompt, seed patch and fixture bundle where applicable, result diff,
  JSONL and raw transcript, stderr, run metadata, command summary, and independent
  check logs. The disposable checkouts retain all trial source.
- `README.md` explains reconstruction and execution settings. No credentials or
  local assistant state are copied into the tracked report or source archive.
- Hook probes, injected startup-context evidence, setup/check logs, and earlier
  CLI rejection evidence are retained for comparison of observed behavior.

Official reference: [Codex hooks](https://learn.chatgpt.com/docs/hooks) documents
hook trust and structured blocking results. The local live probes establish
which behavior works with the installed CLI on this host.
