---
name: kaine-simplify
description: Review a diff or audit the repo for over-engineering only — what to delete, replace with stdlib/platform features, or shrink. Use when asked "is this over-engineered", "what can we delete", "simplify review", "find bloat", or "audit for over-engineering".
argument-hint: diff, branch, PR, path, or "repo" for a whole-tree audit
---

# Simplify Review Workflow

Hunt unnecessary complexity and nothing else. Default scope is the current diff; scan the whole tree when asked to audit the repo. The diff's best outcome is getting shorter.

## Tags

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` hand-rolled thing the standard library ships. Name the function.
- `native:` dependency or code doing what the platform (browser, React Native, Node) already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller. Inline it until a second consumer exists.
- `shrink:` same logic, fewer lines. Show the shorter form.

## Format

One line per finding, ranked biggest cut first:

`<file>:L<line>: <tag> <what to cut>. <replacement>.`

End with `net: -<N> lines possible.` (add `-<M> deps` for a repo audit). Nothing to cut: say `Lean already. Ship.` and stop.

Example: `repo.ts:L88: yagni: AbstractRepository with one implementation. Inline it until a second one exists.`

## Hunt

Dependencies the stdlib or platform already ships, single-implementation interfaces, factories with one product, wrappers that only delegate, files exporting one thing, dead flags and config, hand-rolled stdlib.

## Method

- For diffs, follow the diff-reading rules in `kaine-review` (use `gh pr diff` for PRs; never judge a stale branch with `main...HEAD`).
- Read enough surrounding code to know a "single caller" is really single — check the other platform surface (web vs mobile) before calling something dead.
- Respect repo contracts: `@repo/*` boundaries, generated GraphQL outputs, and design-system tokens are not bloat. Template seams that exist for downstream products are intentional — check `CONTEXT.md` before tagging them `yagni`.

## Boundaries

- Scope: over-engineering and complexity only. Correctness bugs, security holes, and performance go to `kaine-review`, not this pass.
- The minimum test for non-trivial logic is the floor, not bloat — never flag it for deletion.
- Report only; apply nothing unless the user asks.
- A cut with a known ceiling becomes a GitHub issue naming the ceiling and upgrade trigger (`docs/agents/issue-tracker.md`), never a "for now" comment.
