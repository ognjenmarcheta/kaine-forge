# Architecture Decision Records

An ADR records one architectural decision, why it was made, and what it costs. Add one when a change sets a rule that later work must follow, or when it chooses between alternatives that a reviewer would otherwise question again (`kaine-encode-knowledge` ladder, level 5).

## Rules

- Name the file `NNNN-kebab-case-title.md` and take the next free number.
- Do not delete or rewrite an accepted ADR. To change a decision, add a new ADR, set the old one's status to `Superseded by ADR NNNN`, and link back from the new one.
- Keep it short. Link to code, docs, and tests instead of copying them.
- Use `CONTEXT.md` terms for domain concepts.

## Template

```markdown
# ADR NNNN: Decision Title

- Status: Proposed | Accepted | Superseded by ADR NNNN
- Date: YYYY-MM-DD

## Context

The problem, the forces at play, and the constraints that applied.

## Decision

What we decided, with the files or seams that implement it.

## Alternatives Considered

- Option: why it was not chosen.

## Consequences

- Pros:
  - …
- Cons:
  - …
```
