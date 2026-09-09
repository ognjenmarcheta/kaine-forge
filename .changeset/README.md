# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) for release metadata,
versioning, and changelog generation.

## Create release metadata

When a PR changes behavior in `apps/**`, `packages/**`, or `tooling/**`, add a changeset file:

```bash
pnpm changeset
```

Choose the affected package(s), select the bump type, and write a short summary.

Documentation-only, AI-scaffold-only, CI-only, and repository-policy-only changes normally do not need a changeset unless they change a published workspace package behavior.

## Local release commands

```bash
pnpm release:status
pnpm release:version
pnpm release:publish
```

- `release:status` checks pending release metadata.
- `release:version` applies changesets and updates changelogs/versions.
- `release:publish` runs `changeset git-tag` to create git tags from versioned packages (no npm publish).

## CI behavior

- PRs enforce changeset presence for source changes unless the PR has label
  `release:skip-changeset`.
- Merges to `main` run the release workflow, which creates/updates version PRs and
  emits GitHub Releases from created tags.
