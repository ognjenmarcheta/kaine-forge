# Automation Gap Audit

Snapshot of template rules that are encoded as docs/REVIEW/skills but not fully machine-checked.
Update when a gap is closed or a new proven failure mode appears.
Last reviewed: 2026-09-12 (manual evaluations, local reports, sandbox preflight and context measurements).

This audit records evidence and residual gaps. Candidate checks remain proposals unless an executable check is named.

| Gap                                                      | Encoded today                                                                                                                                                                                                              | Residual risk                                                                                                                                   | Candidate future check                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client-supplied org id on scoped APIs                    | REVIEW (Security, Auth & Tenancy), CONTEXT, MONOREPO_GUIDE; session scope helpers (`requireOrganizationScope`) and feature tests (e.g. todos/notes adapters, `context.auth-scope.test.ts`)                                 | New resolvers/adapters may take `organizationId` from client args instead of session scope                                                      | Shared test helper asserting scoped handlers use context scope; optional lint for `organizationId` in GraphQL input types on tenant mutations                                                                                                                 |
| Deep package imports (`@repo/*/…` beyond public exports) | REVIEW (Architecture & Boundaries), MONOREPO_GUIDE; package `exports`; ESLint `no-restricted-imports` for `@repo/*/src/**` and cross-platform UI (`@repo/ui` ↔ `@repo/mobile-ui`) in `packages/config/eslint/base.js`      | Packages can still widen `exports` without review; TypeScript path aliases can hide some deep-import cases                                      | Keep exports reviews; optional dependency-cruiser if export surface abuse recurs                                                                                                                                                                              |
| Hand-edited GraphQL generated files                      | REVIEW (Data & GraphQL), MONOREPO_GUIDE; root `pnpm generate` runs API `schema:generate` then client codegen; CI `graphql-schema` job regenerates and fails on drift of `schema.graphql` + `apps/*/src/graphql/generated/` | Residual: local generate without commit still fails only in CI                                                                                  | Closed for CI drift; keep REVIEW “do not hand-edit”                                                                                                                                                                                                           |
| Hardcoded UI colors / non-token styles                   | DESIGN_SYSTEM.md; REVIEW (UI & i18n); `packages/ui/src/styles/design-system.contract.test.ts` (token doc/CSS/preset alignment)                                                                                             | Contract test covers token catalog alignment, not every app/feature file that might hardcode colors or spacing                                  | Expand contract or add style lint for raw `#hex` / `rgb()` outside token surfaces if noise is low                                                                                                                                                             |
| Untranslated user-facing strings                         | REVIEW (UI & i18n); `@repo/translation` + i18n helpers                                                                                                                                                                     | New components can ship English (or other) string literals without going through translation JSON                                               | i18n lint / no-literal-string rule if false-positive rate is tolerable                                                                                                                                                                                        |
| Agent guide/skill structure                              | `.ai/` canonical sources; `pnpm ai:install` / `pnpm ai:doctor` including `lintDomainKnowledgeInfra` (REVIEW source, encode skill, day-one ramp, required Serena memories, etc.)                                            | Structure and drift covered for the domain-knowledge infra surface; content quality of skills/guides remains human-owned                        | Keep doctor structure gates; no new machine check needed for structure                                                                                                                                                                                        |
| REVIEW prose quality                                     | Canonical `.ai/review.md` → installed `REVIEW.md`; human + `kaine-review` / `kaine-encode-knowledge` maintenance                                                                                                           | Bullets can go stale relative to product or template evolution                                                                                  | Periodic encode-knowledge + audit refresh when review rejections show gap                                                                                                                                                                                     |
| Low-evidence typing not covered by `anti-slop/*` lint    | REVIEW (Quality Gates: `satisfies` over widening, `unknown` boundary discipline, boundary parsing over ad hoc `typeof`); `.ai/guide.md` Working Rules + Anti-Patterns                                                      | Known-value widening, widen-then-assert flows, ad hoc `typeof` narrowing (~61 sites), and conditional `{}` spreads (~43 sites) stay review-only | Add the remaining anti-slop rules (`no-known-value-widening`, `no-widen-then-assert`, `no-runtime-typeof`, `no-conditional-empty-object-spread`, `unknown`-contract rules) if these failure modes recur; needs type-aware lint or high-precision syntax rules |
| Guide/skill efficacy unmeasured                          | `pnpm ai:doctor` lints structure (headings, skill list sync, prefixes); content ships untested                                                                                                                             | A guide rule can be a behavioral no-op — present in the prompt but not changing agent output                                                    | `kaine-harness-eval` + ledger `docs/agents/harness-evals.md` — human-invoked A/B against a stripped `AGENTS.md`, scoped to rules whose efficacy is in doubt                                                                                                   |

## Closed by this work

- Assistant case execution and stored-state grading: `pnpm eval:assistant`; human response review remains required. See [manual tooling](agent-engineering.md).
- Terminal model-run accounting and offline log summaries: success, failure and cancellation are explicit. Real usage baselines remain pending.
- Duplicate skill inventory: one generated index occupies the existing guide location. Installer and doctor reject missing/duplicate markers and stale output.
- Native sandbox dispatch is guarded by positive and negative probes. **Boundary certification remains open:** the native Windows path passes filesystem controls but permits loopback networking; the runner fails closed.

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
