# Automation Gap Audit

Snapshot of template rules that are encoded as docs/REVIEW/skills but not fully machine-checked.
Update when a gap is closed or a new proven failure mode appears.
Last reviewed: 2026-09-28 (CodeRabbit follow-up: PID parsing and output-closure reporting).

This audit records evidence and residual gaps. Candidate checks remain proposals unless an executable check is named.

| Gap                                                      | Encoded today                                                                                                                                                                                                              | Residual risk                                                                                                                                   | Candidate future check                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client-supplied org id on scoped APIs                    | REVIEW (Security, Auth & Tenancy), CONTEXT, MONOREPO_GUIDE; session scope helpers (`requireOrganizationScope`) and feature tests (e.g. todos/notes adapters, `context.auth-scope.test.ts`)                                 | New resolvers/adapters may take `organizationId` from client args instead of session scope                                                      | Shared test helper asserting scoped handlers use context scope; optional lint for `organizationId` in GraphQL input types on tenant mutations                                                                                                                 |
| Deep package imports (`@repo/*/…` beyond public exports) | REVIEW (Architecture & Boundaries), MONOREPO_GUIDE; package `exports`; ESLint `no-restricted-imports` for `@repo/*/src/**` and cross-platform UI (`@repo/ui` ↔ `@repo/mobile-ui`) in `packages/config/eslint/base.js`      | Packages can still widen `exports` without review; TypeScript path aliases can hide some deep-import cases                                      | Keep exports reviews; optional dependency-cruiser if export surface abuse recurs                                                                                                                                                                              |
| Hand-edited GraphQL generated files                      | REVIEW (Data & GraphQL), MONOREPO_GUIDE; root `pnpm generate` runs API `schema:generate` then client codegen; CI `graphql-schema` job regenerates and fails on drift of `schema.graphql` + `apps/*/src/graphql/generated/` | Residual: local generate without commit still fails only in CI                                                                                  | Closed for CI drift; keep REVIEW “do not hand-edit”                                                                                                                                                                                                           |
| Hardcoded UI colors / non-token styles                   | `packages/config/eslint/react.js` rejects arbitrary hex/rgb/hsl color classes and hex literals; design-system contract tests check catalog alignment                                                                       | These selectors do not prove every CSS property or spacing value uses tokens                                                                    | Review uncovered syntax; expand only after a concrete miss                                                                                                                                                                                                    |
| Untranslated user-facing strings                         | `react/jsx-no-literals` and attribute restrictions in `packages/config/eslint/react.js` cover configured web/mobile surfaces; locale consistency tests                                                                     | Dynamic expressions, omitted surfaces and translation quality still need review                                                                 | Extend selectors from demonstrated misses                                                                                                                                                                                                                     |
| Agent guide/skill structure                              | Shared content inspection in doctor/startup; `--strict` tracked drift; `--agent <agent> --local --json` selected installation and prerequisites                                                                            | Readiness does not prove runtime connectivity or instruction efficacy                                                                           | Explicit `--probe-mcp`; behavioral comparisons remain separate                                                                                                                                                                                                |
| REVIEW prose quality                                     | Canonical `.ai/review.md` → installed `REVIEW.md`; human + `kaine-review` / `kaine-encode-knowledge` maintenance                                                                                                           | Bullets can go stale relative to product or template evolution                                                                                  | Periodic encode-knowledge + audit refresh when review rejections show gap                                                                                                                                                                                     |
| Low-evidence typing not covered by `anti-slop/*` lint    | REVIEW (Quality Gates: `satisfies` over widening, `unknown` boundary discipline, boundary parsing over ad hoc `typeof`); `.ai/guide.md` Working Rules + Anti-Patterns                                                      | Known-value widening, widen-then-assert flows, ad hoc `typeof` narrowing (~61 sites), and conditional `{}` spreads (~43 sites) stay review-only | Add the remaining anti-slop rules (`no-known-value-widening`, `no-widen-then-assert`, `no-runtime-typeof`, `no-conditional-empty-object-spread`, `unknown`-contract rules) if these failure modes recur; needs type-aware lint or high-precision syntax rules |
| Guide/skill efficacy                                     | Historical runs in `harness-evals.md`; fresh baseline/candidate snapshots via `pnpm harness:context --prepare`                                                                                                             | No new live comparison or quality result; reduced candidate is not adopted                                                                      | Same cases/settings in fresh sessions after isolation and budget gates                                                                                                                                                                                        |

## Current implementation and open gates — 2026-09-27

- `pnpm ai:doctor --agent <agent> --local --json` detects content drift without mtime dependence and respects selected subsets. Startup calls the same bounded inspector and labels runtime checks not verified.
- `.ai/mcp.json` uses exact npm versions and a Serena commit. Doctor/tests validate pins. Opt-in initialization passed for filesystem, Context7, Playwright and Serena. After installing `uvx 0.12.19`, refreshing the process PATH and preparing Serena's pinned environment, both local readiness checks pass. The cold-start timeout remains enforced.
- `pnpm agent:run --probe-only --mode read` and `--mode edit` record CLI 0.154.0, non-secret effective permissions and individual results. Filesystem/environment controls pass; loopback connections remain allowed despite `network.enabled=false`. Both fail closed. Isolation is not certified.
- `pnpm harness:benchmark` lists seven case families. Repair cases retain independent verification. New workflows prepare common Codex/Claude artifacts, a CRUD verifier and hash-bound human review. Synthetic traces, good/bad artifacts and protected-file tests validate the offline machinery. New workflow live adapters and Claude execution remain unsupported; no other harness is substituted.
- `pnpm agent:report` groups matching case/harness/model/configuration records, keeps legacy totals and separates missing usage/review/cleanup measurements. `cleanupFailures` counts unsuccessful cleanup; legacy missing fields count as `missingCleanup`. Offline controls do not become agent-performance results.
- `pnpm harness:context --prepare` creates disposable baseline/candidate snapshots. Production instructions remain unchanged. Word counts are not quality evidence.

Coverage and exact commands are in the existing [agent-engineering guide](agent-engineering.md).
No paid model call, automatic model CI run, merge or deployment belongs to this rollout.

### Model-run lifecycle follow-up

Model execution now shares checked process-tree cleanup with preflight and MCP
checks. One finalization path handles exit, startup failure, stream failure,
timeout and cancellation within five seconds. Failed cleanup cannot produce a
completed model run; reports retain both the original failure and cleanup status.
Releasing controller handles after the deadline does not certify process exit.
Verified cleanup remains `passed` when output closure times out; a separate failure
prevents successful completion without inflating cleanup-failure counts. Both
synthetic descendant readers buffer a complete line and validate the PID before
fallback termination. Regression checks cover fragmented and invalid PID output,
late stream closure, original failure preservation, and nonzero CLI completion.
Synthetic tests verify overlapping signals, missing close events, denied dispatch
and nonzero CLI status on cleanup failure. Real Node stand-ins exercise child
termination without model calls. `pnpm ai:test` uses one worker to avoid the
observed parallel subprocess timeouts; production deadlines remain unchanged.
Three consecutive Windows runs passed 336 tests with one POSIX-only skip;
`pnpm check`, strict doctor and Codex/Claude local readiness also passed.
The 2026-09-28 CodeRabbit follow-up passed 46 focused tests and `pnpm check`,
including 352 AI tests and one POSIX-only skip. Installation, strict doctor and
both local readiness checks passed again.

## Earlier tooling closures

- Assistant case execution and stored-state grading: `pnpm eval:assistant`; human response review remains required. See [manual tooling](agent-engineering.md).
- Terminal model-run accounting and offline log summaries: success, failure and cancellation are explicit. Real usage baselines remain pending.
- Duplicate skill inventory: one generated index occupies the existing guide location. Installer and doctor reject missing/duplicate markers and stale output.
- Native sandbox dispatch is guarded by positive and negative probes. **Boundary certification remains open:** the native Windows path passes filesystem controls but permits loopback networking; the runner fails closed.

## PR #437 hardening — 2026-09-27

PR #437 hardening adds requested-selection/ownership metadata with legacy migration.
Installer regressions cover empty and personal-only installs, recorded empty selections,
optional selections, missing prerequisites and removed definitions. Ambiguous legacy MCPs
remain preserved for review. Session startup reads a selected, enabled, current Serena cache;
only explicit `--prepare-serena` runs its pinned dependency, with time/output limits.
Prompt availability is separate from installation readiness and runtime certification.

The explorer's rendered tool list is restricted to `Read`, `Grep`, `Glob`; live enforcement
has not been certified. Snapshot tests cover content, modes and symlink targets on POSIX;
Windows skips the POSIX-specific case. Trusted-probe tests replace workspace source after
comparison and verify captured controller code still executes. Cleanup tests cover launch
errors, nonzero termination, timeout, normal termination and a synthetic child process.
Both native sandbox modes still fail network denial. No paid evaluation or context adoption
is authorized by these offline results.

## Context audit — 2026-09-12

Reproduce with `pnpm ai:context --revision <before-revision>` and `pnpm ai:context`.
Before measurements use revision `0999c4a5875116a4a896124668da477a8d8090a8`. Counts normalize CRLF to LF,
count Unicode characters, and split words on whitespace. They are **not model
tokens** or a measured session context size. The inventory lists ownership,
loading mechanism and duplication for every source, agent definition and skill.
Invisible host, tool, plugin and personal instructions are excluded.

| Material                    | Loading / owner                                            | Before words / characters | After words / characters |
| --------------------------- | ---------------------------------------------------------- | ------------------------: | -----------------------: |
| `.ai/guide.md`              | Canonical generator input; on demand                       |            2,913 / 19,678 |           2,673 / 17,876 |
| `AGENTS.md`                 | Generated repository instruction injection, host dependent |            3,506 / 23,889 |           3,259 / 22,031 |
| `CLAUDE.md`                 | Generated import of AGENTS; no second guide copy           |                    1 / 11 |                   1 / 11 |
| Cursor rule source          | Canonical `.ai`; always-applied on Cursor                  |               253 / 1,735 |              253 / 1,735 |
| Explorer definition         | Canonical `.ai`; selected dispatch                         |               147 / 1,023 |              147 / 1,023 |
| Implementer definition      | Canonical `.ai`; selected dispatch                         |               280 / 1,935 |              280 / 1,935 |
| 17 skill frontmatter blocks | Canonical `.ai`; discovery metadata                        |               501 / 3,800 |              501 / 3,800 |
| `MONOREPO_GUIDE.md`         | Repository; required code-task reading                     |            3,779 / 35,036 |           3,779 / 35,036 |
| `CONTEXT.md`                | Repository; domain-task reading                            |               670 / 4,942 |              670 / 4,942 |
| `REVIEW.md`                 | Generated `.ai/review.md`; review reading                  |               986 / 6,745 |              986 / 6,745 |
| `DESIGN_SYSTEM.md`          | Repository; UI-task reading                                |            2,734 / 21,007 |           2,734 / 21,007 |
| Day-one guide               | Repository; onboarding reading                             |               626 / 4,986 |              626 / 4,986 |
| Domain guide                | Repository; domain-layout reading                          |               195 / 1,313 |              195 / 1,313 |

The confirmed duplicate was the manually maintained skill list plus the appended
generated index. Descriptions now come from skill metadata at the first location.
The generated guide loses 247 words and 1,858 characters. All behavior rules and
the generated guarded-command section remain. No model latency, cost or quality
improvement is inferred from this reduction.

Further candidates require evidence: skill metadata appears in host discovery and
the guide; agent definitions repeat selected task rules for emphasis; required
reading repeats some tenancy and typing rules. These are not removed. Different
hosts load these sources differently, and the existing A/B ledger does not prove
that removing the overlap improves results. Full skill bodies remain on demand;
the inventory reports their individual sizes without adding them to an injected
context total.

## Earlier closures

- Missing shared REVIEW contract → `.ai/review.md` + install/doctor (`REVIEW.md`)
- Missing promotion ladder → `kaine-encode-knowledge`
- Missing day-one agent ramp → `docs/agents/day-one.md` (+ CONTRIBUTING alignment)
- Doctor silent on domain-knowledge structure → `lintDomainKnowledgeInfra`
- Chained type assertions, unjustified assertions, `unknown`-concealing aliases, `Shape` type names, `Reflect.get/apply`, broad `object` types → `anti-slop/*` ESLint rules in `packages/config/eslint/anti-slop.js` (2026-08-20)
