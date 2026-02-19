# ADR 0004: Release Automation with Changesets + GitHub Releases

- Status: Accepted
- Date: 2026-02-19

## Context

Phases 1-7 established a production-grade monorepo baseline with CI quality gates and e2e
coverage. Release operations were still mostly manual and documented only as checklist steps.

This repository is private and currently does not publish npm packages, but it still needs:

- deterministic version/changelog generation
- reproducible release metadata per merge cycle
- automated release artifacts in GitHub

## Decision

Adopt Changesets as the canonical release metadata and versioning mechanism, and automate release
flows via GitHub Actions:

1. PRs that touch `apps/**`, `packages/**`, or `tooling/**` must include a `.changeset/*.md`
   file unless explicitly labeled `release:skip-changeset`.
2. Pushes to `main` run a dedicated release workflow.
3. The release workflow:
   - executes `pnpm check:ci` and `pnpm test:e2e`
   - uses Changesets to create/update a version PR
   - on version PR merge, creates package tags and corresponding GitHub Releases
4. No npm publishing is performed in this phase; all workspaces remain private.

## Consequences

- Pros:
  - consistent release metadata and changelog history
  - reduced manual release toil and fewer operator mistakes
  - clear release traceability from PR -> changeset -> tag -> GitHub release
- Cons:
  - contributors must learn and follow Changesets workflow
  - release output remains GitHub-centric until deployment automation is added
