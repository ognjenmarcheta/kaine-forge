# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root for project domain vocabulary.
- **`REVIEW.md`** for the shared review checklist (canonical `.ai/review.md`).
- **`docs/adr/`** for architectural decisions that touch the area being worked on.

If `CONTEXT.md` is missing in a downstream copy of this template, proceed silently. Producer skills such as `/grill-with-docs` create it lazily when terms or decisions get resolved.

## File structure

Kaine Forge uses a single-context layout:

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-tauri-over-electron.md
│       └── 0002-mobile-runtime-alignment.md
└── apps/
```

## Use the glossary's vocabulary

When output names a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the term as defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If the concept needed is not in the glossary yet, either reconsider whether the term is project language or note the gap for `/grill-with-docs`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding it:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because..._
