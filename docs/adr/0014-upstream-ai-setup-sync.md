# ADR 0014: Upstream AI setup sync for adopted projects

- Status: Accepted
- Date: 2026-10-26

## Context

Projects created from this template get the AI setup once. `pnpm template:adopt` renames the
template identity in 14 `.ai/` files and records nothing. After that, a project had no way to
take upstream improvements to the guide, review checklist, skills, hooks, or installer:

- A manual merge conflicted on every line that adoption renamed.
- Projects customized `.ai/guide.md` and `.ai/review.md` in place, because there was no
  overlay. Every upstream edit to those files then became a hand merge.
- `.ai/` belongs to no package, so it has no version or tag to compare against.

## Decision

- **Ownership by folder.** Upstream owns `.ai/*`. The project owns `.ai/project/*`, which
  upstream never ships and sync never writes. The installer appends
  `.ai/project/guide.md` to `AGENTS.md` and `.ai/project/review.md` to `REVIEW.md`, and it
  installs `.ai/project/skills/` and `.ai/project/agents/`, whose names must start with
  `<repoSlug>-`.
- **Adoption record.** `template:adopt --write` writes `.ai/project/template.json`: the
  adoption config, the upstream URL and ref, and later the last synced upstream commit
  (`base`).
- **Upstream manifest.** `.ai/template-sync.manifest.json` lists the synced files: the AI
  content plus the installer, doctor, adoption, and sync tooling. Other tools in `.ai/`
  (release-apps, scorecard, create-feature, harness, benchmarks) are not synced. Sync reads
  the manifest at the target commit, so new upstream files arrive in the same run.
- **`pnpm ai:sync`** (`.ai/template-sync.ts`) fetches the upstream ref without adding a
  remote. It applies the project's adoption rename to the upstream base and target, then runs
  a 3-way merge with `git merge-file`, so identity strings never conflict. It requires the
  synced files to be clean in git, so `git checkout` undoes a sync. It updates its own
  `self` files first and re-runs the new version. Conflicts get git-style markers, and
  `ai:doctor` fails until they are resolved. After a clean sync it runs `ai:install`,
  `ai:doctor`, `ai:typecheck`, and `ai:test`.
- **Base discovery.** A record without `base` uses shared history (`git merge-base`), then an
  upstream commit with the same tree as the project's root commit ("Use this template"), then
  the last upstream commit before the project's first commit. `--base <sha>` overrides it.
- **Projects adopted earlier** copy the sync tool from upstream and run
  `pnpm ai:sync --init <template-adoption.json>`.

## Alternatives Considered

- Publish the AI setup as an npm package: it needs a publish pipeline and moves the canonical
  source out of the repository.
- Make upstream files identity-free with placeholders: it is a large rewrite of the guide,
  skills, agents, and hooks for the same result as re-applying the rename.
- Overwrite upstream-owned files on every sync: it loses local edits without a trace.
- Version `.ai/` with Changesets tags: it adds release work to every AI change. A recorded
  commit SHA is enough to compute what changed.

## Consequences

- Pros:
  - An adopter runs one command and reviews one diff.
  - Project customizations live in files upstream never touches.
  - Real overlaps surface as ordinary merge conflicts.
- Cons:
  - `ai.util.ts` is shared with tools that do not sync, so a sync can break them. The
    post-sync `ai:typecheck` and `ai:test` catch this.
  - The `self` files may import only each other, node built-ins, and zod.
  - Root files such as `package.json` and `knip.json` do not sync. A new script or entry
    there reaches adopters only through the release notes.
  - A scheduled workflow that opens a sync pull request is not part of this decision.
