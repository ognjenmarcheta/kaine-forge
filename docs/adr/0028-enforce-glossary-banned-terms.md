# ADR 0028: Enforce the glossary's banned terms

- Status: Accepted
- Date: 2026-11-14
- Applies to: `CONTEXT.md`, `packages/config/eslint/domain-terms.js`, `packages/translation/src/locales/en/**`

## Context

`CONTEXT.md` names each product concept and lists the synonyms to avoid. Every agent reads it
before it names anything, and `REVIEW.md` asks reviewers to check public names against it.
Nothing checked it automatically. Screen copy drifted in 13 English strings: "Invite your team",
"set up your workspace", and, on the desk, "Needs you" and "Waiting for you", which the **Item
state** entry rules out.

The `_Avoid_` lists cannot be enforced as they are. Most of their words are wrong only next to one
concept: "role" is correct for an Organization Membership and wrong for a desk Agent, and
"account" is correct for a User's sign-in and wrong for an Organization. A scan of the English
copy against all 103 `_Avoid_` words found about 300 hits, nearly all of them correct uses.

## Decision

- `CONTEXT.md` has a **Banned terms** table. A word goes in only when no correct use of it exists
  in a scope: `product` (English copy outside `desk.json`), `desk` (English copy in `desk.json`),
  or `names` (declared TypeScript names under `apps/` and `packages/`, and the names in
  `apps/api/schema.graphql`).
- `packages/config/eslint/domain-terms.js` reads the table. Its lint rule `domain/banned-terms`
  checks declared names, and `domain-terms.test.js` checks the English copy and the GraphQL schema.
  Both match whole words, any case, with an optional plural.
- There is no exception list. When a correct use appears, the row's scope narrows or the row goes.
- The `_Avoid_` lists stay guidance. Drift that depends on the concept is found by judgment, with
  the `kaine-domain-language` skill's audit mode and in review.

## Alternatives Considered

- Ban every `_Avoid_` word: about 300 false positives, so contributors would learn to ignore it.
- Keep the words in a JS module and mirror them in `CONTEXT.md`, like the Context map
  (`api-contexts.js`): two edits for each new word. The Context map needs structured data for its
  lint rule; a word list does not, so the document stays the one source.
- An exception list keyed by translation key: it would contradict the rule that a banned word has
  no correct use, and it would grow instead of shrink.

## Consequences

- Pros:
  - A banned word fails `pnpm lint` or `pnpm check` with the term to use instead.
  - Agents read exactly the list that CI enforces.
- Cons:
  - Only English copy is checked. Other locales follow the English change in review.
  - The table covers few words on purpose; most drift still needs a reviewer.
  - A downstream copy without the table gets no check until it adds one.
