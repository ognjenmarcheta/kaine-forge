# ADR 0009: Domain Knowledge as Agent Infrastructure

- Status: Accepted
- Date: 2026-07-22

## Context

High-leverage engineering has long meant automating work: editor tooling, lint rules, tests, and encoded conventions. Agent-assisted development raises the stakes: every missing rule is paid not only by humans but by every agent session in tokens and missed cases. Domain knowledge that lives only in people's heads blocks day-one contributors and causes review rejections for "not how we do things here."

Kaine Forge already ships an AI scaffold (`.ai/guide.md`, skills, Serena memories, `pnpm ai:install` / `pnpm ai:doctor`). Gaps remained: no first-class shared review contract, no explicit promotion ladder from repeated failures to durable infra, and doctor checks that validated file drift more than domain-knowledge structure.

## Decision

Treat domain knowledge as infrastructure for humans and agents:

1. **Review contract:** Canonical `.ai/review.md` installs to tracked root `REVIEW.md`. `kaine-review` is the review _method_; REVIEW is the shared checklist.
2. **Promotion ladder:** Skill `kaine-encode-knowledge` walks failure mode → test/lint/REVIEW/skill/CONTEXT/ADR encoding.
3. **Structure gates:** `pnpm ai:doctor` fails CI on missing or malformed canonical structure (REVIEW source and required headings, CONTEXT required sections, encode skill present, kaine-review references REVIEW, day-one ramp docs, required Serena memories). Installed `REVIEW.md` drift remains advisory like other generated shared files.
4. **Day-one ramp:** `docs/agents/day-one.md` plus a short CONTRIBUTING section so agent-assisted contributors have a zero-extra-context path.
5. **Hard automation:** Prefer machine checks when failure modes are proven; do not invent speculative linters. Residual gaps live in `docs/agents/automation-gap-audit.md`.

## Alternatives Considered

- Review skill only (no REVIEW.md): rejected — humans and non-Claude tools miss the contract; essay and ramp fail.
- Root-only REVIEW without install/doctor: rejected — drifts from the template's canonical `.ai/` model.
- Automation-debt issue tracker as product: rejected — process overhead for a template; skills + audit doc suffice.
- Doctor thinness heuristics (line counts): rejected — noisy false positives.

## Consequences

- Pros:
  - agents and humans share one review contract
  - repeated domain failures have a named encode path
  - CI blocks silent rot of required agent artifacts
  - adopters inherit the loop via template sources
- Cons:
  - more canonical AI surface area to maintain
  - CONTRIBUTING/day-one/REVIEW must stay aligned when rules change
  - structure checks do not guarantee prose quality of checklist items
