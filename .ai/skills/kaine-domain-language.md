---
name: kaine-domain-language
description: Build and enforce the ubiquitous language in CONTEXT.md — sharpen a new or fuzzy domain term with the owner, audit a scope for drift from the glossary, or rename code and copy to the glossary's terms. Not for the API bounded-context map, which lint enforces, or a general code review (kaine-review).
argument-hint: sharpen <concept, plan, or issue> | audit <path or namespace> | refactor <old term> <new term>
---

# Domain Language Workflow

`CONTEXT.md` is the ubiquitous language of Kaine Forge: one name for each product concept, used the same way in talk, issues, code, schema, and screen copy. This skill keeps the glossary sharp and the code faithful to it.

## Goal and non-goals

- Goal: one agreed term for each concept, recorded in `CONTEXT.md`, and code and copy that use it.
- The owner decides what a term means. Propose; do not decide a definition alone.
- Do not change the Context map without a new or changed ADR (ADR 0025, 0026).
- Do not rename a database table or column, or a better-auth name, as part of this skill. Propose it as a separate change; it needs a migration and the owner's decision.
- Audit mode reads only.

## Read first

- `CONTEXT.md` in full: Language, Relationships, Flagged Ambiguities, and Banned terms.
- `docs/agents/domain.md` and ADR 0028 (what the banned-terms check covers and what it leaves to judgment).

## Sharpen

Use it when a plan, issue, or conversation names a concept that the glossary lacks, or uses two words for one thing.

1. List each candidate concept with the words the source uses for it.
2. Ask the owner one question at a time. Attach your proposed answer so the owner can confirm or correct it. Ask what it is, what it belongs to, what it is not, and which word the owner says aloud.
3. Write the entry in the house format: `**Term**:`, a definition of one to three sentences that names its owner and its limits, and `_Avoid_:` with the synonyms you heard. Add each relationship to **Relationships**, and each word with two meanings to **Flagged Ambiguities**.
4. Add a row to **Banned terms** only when the word is wrong everywhere in a scope. Run the gate. If it reports a correct use, narrow the scope or drop the row.
5. Use the new term at once in the plan, issue, or test names that started the request.

## Audit

Use it for one feature folder, workspace, or translation namespace. The banned-terms check already catches words that are always wrong. This mode finds drift that depends on the concept: an `_Avoid_` synonym used for its concept, or one concept with two names.

1. Collect the names in scope: exported types and functions, GraphQL types and fields, translation keys and English values, and test names.
2. For each `_Avoid_` word that appears, read the code around it. Report it only when it names the concept that the entry defines. "role" for a membership role is correct; "role" for a desk **Agent** is drift.
3. Report each finding with `path:line`, the word, the glossary term, and the rename. Group the findings by concept.
4. Report missing terms: a concept that the code names often but `CONTEXT.md` does not define.

## Refactor

Use it to rename code and copy to a glossary term after the term is agreed.

1. Size the blast radius before you edit. Run `graphify affected "<symbol>"` when the graph is available. Check the callers in each workspace; one package's references can miss another package.
2. Rename in this order, and keep each step green:
   - TypeScript symbols: a reference-aware rename, then read `git diff` and run the package typecheck.
   - Translation copy: change the English value and the same key in every locale. Keep keys unless a key itself names the old term.
   - GraphQL: edit the SDL source, then run `pnpm generate`. A renamed type or field breaks API clients. Add a changeset that says so, or keep the old field deprecated for one release.
   - Tests and e2e selectors that match the old copy.
3. When the old word is now wrong everywhere in a scope, add it to **Banned terms** so it cannot come back.

## Gotchas

- The check matches whole words. `teammate` is not `team`, and `steamId` passes.
- The `names` scope covers `apps/` and `packages/` only. Tooling and the AI scaffold have their own language: there, "team" is the developer team and "workspace" is a pnpm workspace.
- A desk term goes in the "Agent desk language" section, never in the product Language list.

## Headless runs (Agent Desk)

When the prompt supplies a result schema, run Audit on the plan or diff that the engine supplies. Fill the schema. Ask no questions. Each finding starts with a `kaine-review` label and names the term it should use.

## Canonical commands

```bash
pnpm --filter @repo/config exec vitest run eslint/domain-terms.test.js   # banned terms in copy and the schema
pnpm lint                                                                # banned terms in declared names
git grep -nwiE '<avoided word>' -- apps packages ':!**/dist/**'          # audit leads; read each hit
```
