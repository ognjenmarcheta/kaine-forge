<!-- GENERATED FILE. Do not edit directly. Run: pnpm ai:install -->

# Review Checklist

Shared contract for humans and agents reviewing changes in this repository.
Canonical source: `.ai/review.md`. Installed output: `REVIEW.md` (run `pnpm ai:install`).
Use skill `kaine-review` for method and severity ordering; this file is the **what must be true** checklist.

## Correctness

- [ ] Behavior matches the request; no unrelated refactors or speculative features (`MONOREPO_GUIDE.md`, `.ai/guide.md` Working Rules).
- [ ] Edge cases for auth, empty states, and error paths are handled where the change touches them.
- [ ] No silent swallowing of errors that should surface to the user or logs.

## Security, Auth & Tenancy

- [ ] Organization-scoped data uses **Authenticated Organization Scope** / active organization from session — never a client-supplied organization id for scoped reads/writes (`CONTEXT.md`, `MONOREPO_GUIDE.md`).
- [ ] Authorization and membership checks remain correct for the touched paths.
- [ ] No secrets, tokens, or `.ai.local/` material committed; MCP config uses placeholders only (`SECURITY.md`, `.ai/guide.md`).
- [ ] CORS / trusted origins and cookie/session assumptions stay consistent with `@repo/auth` (ADR 0008).
- [ ] File/attachment access remains organization-scoped when relevant.

## Architecture & Boundaries

- [ ] Imports use `@repo/*` public exports only — no deep/internal package paths (`MONOREPO_GUIDE.md`).
- [ ] Feature code follows FDD naming: `{feature}.{purpose}.ts(x)` under feature folders.
- [ ] Web/desktop UI uses `@repo/ui`; React Native uses `@repo/mobile-ui` — no cross-imports.
- [ ] Changes stay within package boundaries; shared logic lives in the correct `@repo/*` package.
- [ ] Template changes avoid downstream product-specific assumptions (`CONTRIBUTING.md`).

## Data & GraphQL

- [ ] Schema/validators/types for persistence live in `@repo/db` when data shape changes.
- [ ] GraphQL SDL/resolvers/adapters follow feature layout; registry updated when adding features.
- [ ] Operations edited at source; `pnpm generate` run; generated GraphQL outputs not hand-edited.
- [ ] Organization scoping enforced in resolvers/adapters for tenant data.
- [ ] Already-shipped migration files are not rewritten in place; schema changes are new migrations and preserve load-bearing order (`docs/troubleshooting.md`, ADR 0008).

## UI & i18n

- [ ] Styling is token-only (`--ds-*` via repo Tailwind utilities); no raw colors/spacing hacks (`DESIGN_SYSTEM.md`).
- [ ] User-facing strings live in translation JSON and are accessed via i18n helpers (`@repo/translation`).
- [ ] Accessibility and component patterns match `DESIGN_SYSTEM.md` for the surface (web vs mobile).

## Quality Gates

- [ ] Tests cover new or changed behavior at the nearest useful layer; risky auth/tenancy/GraphQL paths have tests.
- [ ] No new `any`; prefer precise types or `unknown` with narrowing.
- [ ] `SAFETY:` comments on type assertions state the specific checked invariant (what validated the value), not boilerplate like "needed for types" (lint requires the comment; review checks its substance).
- [ ] Preserved inference or `satisfies` over widening annotations that discard known keys/values (e.g. `const handlers: Record<string, Handler> = { start }` loses the `start` key).
- [ ] `unknown` appears only at intake boundaries and is narrowed immediately; not in exported params/returns (error `cause` excepted) and not as dictionary value contracts (`Record<string, unknown>`) outside true serialization seams (logger context, JSON intake).
- [ ] Parsing or type guards at the boundary seam instead of scattered ad hoc `typeof` checks.
- [ ] No reinvented standard-library or platform features, and no new dependency where stdlib or an already-installed one covers it.
- [ ] No speculative abstraction: single-implementation interfaces, one-caller layers, or config nobody sets — inline until a second consumer exists.
- [ ] Deliberate simplifications with a known ceiling are tracked as GitHub issues naming the ceiling and upgrade trigger, not "for now" comments.
- [ ] Relevant checks run (workspace test/typecheck; root `pnpm check` for broad changes; e2e for user-visible web/API flows).
- [ ] Changesets included for releasable `apps/**`, `packages/**`, `tooling/**` changes unless `release:skip-changeset`.
- [ ] New comments explain non-obvious rationale or consequences only — no noise that restates what the code already shows.

## Domain Language

- [ ] Public names (types, APIs, UI copy keys, issue text) use `CONTEXT.md` terms (**Organization**, **Active Organization**, **Invitation**, etc.) and avoid listed synonyms.
- [ ] New durable concepts are added to `CONTEXT.md` (and ADRs when architectural) rather than left only in chat or PR comments.
- [ ] No contradiction of accepted ADRs under `docs/adr/` without calling it out explicitly.
- [ ] Client scope matches `CONTEXT.md` **Template platform surfaces**: mobile is a subset; web-first features (e.g. notes, assistant) do not require mobile UI unless the task says so.
- [ ] User-facing, config, or architectural behavior changes update the existing authoritative doc (`MONOREPO_GUIDE.md`, `CONTEXT.md`, `docs/adr/`, `DESIGN_SYSTEM.md`) in the same change when required — expand existing docs rather than leaving silent drift or speculative stubs.

## Template & AI Hygiene

- [ ] Assistant guidance edited only under `.ai/`; then `pnpm ai:install` and `pnpm ai:doctor` (`MONOREPO_GUIDE.md` §18).
- [ ] Generated agent files (`AGENTS.md`, `CLAUDE.md`, `REVIEW.md`, `.serena/*`, local skill installs) not hand-edited.
- [ ] Commit messages and PR bodies have no AI self-attribution (`Co-Authored-By` for assistants, “Generated with …” AI footers, AI as author/committer); commitlint blocks this on commit (`.ai/guide.md`).
- [ ] Deployable app changes on `main` consider `pnpm release:apps` / Dockerfile contracts.
- [ ] Domain review rejections or repeated agent mistakes are promoted via `kaine-encode-knowledge` (lint/test/REVIEW/skill/CONTEXT) rather than one-off re-prompts only.
