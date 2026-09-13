---
name: kaine-triage-deps
description: Triage open Dependabot PRs against main and repo policy—prepare safe bumps for owner review, recreate conflicts, close unsafe one-offs with reasons, and track intentional upgrades.
argument-hint: optional PR numbers, or all open dependency PRs
---

# Triage Dependency Bot PRs

Use this skill for the Dependabot queue, dependency PR storms, or when the user pastes a deps-triage prompt.

**Scope:** Dependabot across its five ecosystems here (npm, GitHub Actions, Docker, Cargo, Docker Compose). Issues and product features are out of scope (`kaine-triage-issue` / implementers).

## Inventory

```bash
gh pr list --state open --label dependencies --json number,title,author,headRefName,mergeable,files
# also bot authors if unlabeled
gh pr list --state open --search "author:app/dependabot"
```

For each PR: changed paths, packages, mergeable status, CI checks, whether main already has the bump.

## Triage rules

| Situation                                                                                                     | Action                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Already on main / superseded by catalog or another PR                                                         | **Close** as superseded; link the landing PR/commit                                                                                                          |
| Lockfile-only or trivial patch/minor, clean merge, real green CI                                              | Ensure `release:skip-changeset` when the bump touches `apps/**`/`packages/**` without a product release; **hand off to the owner for manual merge**          |
| Merge conflicts                                                                                               | **Recreate** on current main (`package.json` / catalog + `pnpm install`); force-push the bot branch or open a clean PR — do not leave a broken conflicted PR |
| Mobile Expo/RN singleton (`catalogs.mobile`, monorepo-alignment, `expo` / `react-native*`, frozen navigation) | **Do not** merge isolated bot bumps. Close; track intentional **Expo SDK** upgrade (`npx expo install --fix`, SDK-aligned pins)                              |
| Partial catalog peers (e.g. only `react-dom` without web `catalog:` set)                                      | **Do not** merge. Close or one catalog-aligned PR for the full peer set                                                                                      |
| Tooling majors that need regenerate (GraphQL Codegen suite, etc.)                                             | **Do not** merge a single-package major. Close; track suite upgrade + `pnpm generate` + typecheck/e2e                                                        |
| Test-runtime majors (jsdom, etc.)                                                                             | Recommend owner merge only with package tests green; else dedicated PR or close with reason                                                                  |
| Ambient CI hard gate (e.g. Trivy CRITICAL on main)                                                            | Fix **once** through a PR; after the owner merges it, re-run/update dep PRs — do not thrash every PR with the same root cause                                |
| CI “fail” with empty jobs / ~3s infra noise                                                                   | Re-run or rely on local verification; do not treat as package rejection without logs                                                                         |

Repo anchors: `pnpm-workspace.yaml` (`catalog:` / `catalogs.mobile`), `packages/config/monorepo-alignment.test.ts`, `.github/dependabot.yml` (ignore list, groups, five ecosystems), issue **#198** pattern for intentional upgrade tracking.

## Process

1. Prefer `release:skip-changeset` for pure dependency bumps when Changeset Required would fail on `apps/**` / `packages/**`.
2. After closing unsafe one-offs, file or update **one** tracking issue grouping workstreams; comment on closed PRs: `Tracked in #<N>`.
3. Optionally harden the Dependabot `ignore` list or `groups` so frozen graphs stop reopening (the mobile freeze list lives in `.github/dependabot.yml`).
4. **Authority:** close superseded or unsafe PRs only when the user asked to resolve or clear the queue. Otherwise list recommended dispositions. Only the owner performs the final merge manually after required checks pass. Never merge, approve on the owner's behalf, enable auto-merge, or bypass protection.

## Output

For each PR: `status` (`ready-for-owner` / `recreated` / `closed` / `left-open`) + one-line reason.

End with: commands/results verified, remaining open dependency PRs, any new tracking issue URL.
