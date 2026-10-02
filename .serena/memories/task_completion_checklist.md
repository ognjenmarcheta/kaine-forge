<!-- GENERATED FILE. Do not edit directly. Run: pnpm ai:install -->

# Task Completion Checklist

Before considering a task complete:

- Confirm the changed files match the requested scope.
- Run `pnpm ai:install` after editing `.ai/` sources.
- Run `pnpm ai:doctor` when assistant files are involved.
- Confirm installed assistant outputs are not edited directly and that local-only files stay uncommitted.
- If committing, ensure the message has no AI co-author trailers or “Generated with …” AI footers (commitlint rejects them).
- For reviews, apply `REVIEW.md` (from `.ai/review.md`).
- After domain or template review rejections, prefer `kaine-encode-knowledge` over one-off re-prompts.
- Run focused tests for the changed workspace.
- Run `pnpm generate` when GraphQL schema or operation documents changed.
- Run `pnpm check` for broad or template-level changes; it includes format, lint, boundaries, typecheck, tests, and knip. `pnpm check:affected` omits the whole-graph boundaries and knip checks.
- Confirm caller coverage independently before cross-package refactors; a successful Serena edit does not replace tests or checks.
- Run `pnpm run build:core` when API or web runtime/build behavior changed.
- After deployable app changes merge to `main`, the Release workflow updates affected release branches. Manual release commands, including dry-runs, are human-only.
- Mention any validation that could not be run.
