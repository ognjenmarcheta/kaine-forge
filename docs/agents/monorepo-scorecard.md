# Monorepo Health Scorecard

Repeatable, evidence-bound health scoring for this monorepo. Produced by the `kaine-scorecard` skill; rendered to `scorecard-out/index.html` by `pnpm scorecard`.

This file is the source of truth. It holds the band descriptors, every run's scores and evidence, the finding slugs that prevent duplicate issues, and the calibration notes that bind later runs.

## How to read it

- **Scores** are 0-10 per dimension. Every score cites a command output or a `path:line`. Nothing is inferred from line counts — see ADR 0009 on why noisy heuristics were rejected.
- **Deltas** are meaningful only within the same `mode`. A `fan-out` run scans deeper than a `sequential` one, so compare like with like.
- **Calibration notes** are binding. A later run may disagree, but it must say so explicitly and add its own note rather than silently re-grading.
- `REVIEW.md` governs diffs; this scorecard governs the repo.

## Band descriptors

Apply verbatim. Do not invent intermediate definitions.

| Band | Meaning                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 9-10 | Best-in-class. Enforced by automation, documented, and proven by a gate that would fail on regression. |
| 7-8  | Solid. The right mechanism exists and works; gaps are known, bounded, and deliberate.                  |
| 5-6  | Adequate. Works in practice but leans on convention or human memory where a gate belongs.              |
| 3-4  | Weak. A real mechanism is missing or misconfigured; failures reach main and are caught late or never.  |
| 0-2  | Absent or actively misleading. The mechanism does not exist, or exists and does not do what it claims. |

A dimension whose evidence could not be gathered is recorded `unscored` with a reason and excluded from the overall.

## Dimensions

| #   | Dimension                | Scope                                                                   |
| --- | ------------------------ | ----------------------------------------------------------------------- |
| 1   | Workspace & Boundaries   | Workspace graph, package export contracts, boundary and dead-code gates |
| 2   | Build & Cache            | Turbo task graph correctness, cache hit behavior, global hash surface   |
| 3   | CI Topology & Speed      | Job DAG, gate placement, redundant work, wall-clock                     |
| 4   | Testing & Coverage       | Coverage floors vs measured, excluded workspaces, test depth            |
| 5   | Dependency Hygiene       | Catalog discipline, drift, audit findings, bot PR flow                  |
| 6   | Release & Deploy         | Changesets health, release branch mechanics, image build contracts      |
| 7   | Security Posture         | Scanning gates, auth and tenancy enforcement, supply-chain pinning      |
| 8   | DX & Onboarding          | First-run success, preflight checks, editor and script honesty          |
| 9   | Docs & Agent Scaffolding | AI setup health, CONTEXT/ADR/REVIEW coverage, memory accuracy           |

<!-- scorecard:data:start -->

```json
{
  "schema": 1,
  "runs": [
    {
      "date": "2026-07-28",
      "commit": "15102fc31405d746556d9169c95fdd23bd408f14",
      "mode": "sequential",
      "agent": "grok",
      "overall": 7.3,
      "dimensions": {
        "1": {
          "score": 7,
          "evidence": "pnpm boundaries: 1115 files/19 packages clean; package exports on all packages/*; typecheck:exports in ci-pr.yml:240; knip fails: unused @graphql-codegen/typescript (tooling/graphql-codegen/package.json:23)"
        },
        "2": {
          "score": 8,
          "evidence": "turbo.json dependsOn/inputs/outputs + documented test^build; CI shared turbo-${{ runner.os }}- restore prefix (ci-pr.yml:157-163, release.yml:58-63); globalDependencies tsconfig+workspace"
        },
        "3": {
          "score": 7,
          "evidence": "ci-pr path filters + parallel coverage/docker/e2e shards (artifacts #145); knip+boundaries on PR (#142). Ops: all main/PR jobs since ~2026-07-27T14:06 fail to start — GitHub billing/spending limit (run 30278372014 annotation)",
          "calibration": "Score reflects topology design, not org billing. Do not re-penalize design for account spend unless topology itself regressed."
        },
        "4": {
          "score": 7,
          "evidence": "coverage-summary.json lines 52.06% / funcs 62.24% / branches 78.29% vs floors 50/55/70 (vitest.coverage.config.ts:55-59); stricter auth/api floors; 140 unit + 5 e2e; apps/mobile/** excluded from floors (config:48)"
        },
        "5": {
          "score": 6,
          "evidence": "pnpm-workspace.yaml catalogs + catalogs.mobile; monorepo-alignment.test.ts catalog enforcement; Dependabot+Renovate both label release:skip-changeset. pnpm audit --audit-level high: 25 high / 0 critical (exit non-zero)"
        },
        "6": {
          "score": 8,
          "evidence": "release.yml: check:ci+build:core+test:e2e → release:apps → changesets; origin/release/api|web exist; Dockerfile.* digest-pinned; .changeset/config privatePackages version+tag; pnpm release:status shows pending patches/minors"
        },
        "7": {
          "score": 7,
          "evidence": "CodeQL security-extended; Gitleaks; Trivy CRITICAL exit-code 1 (ci-pr.yml:430-437); CORS fail-closed apps/api/src/server.config.ts:53-56 + tests; org scope from session (context.auth-scope.ts). Gate scripts present; audit high debt + billing blocks live Security/CodeQL runs"
        },
        "8": {
          "score": 8,
          "evidence": "scripts/doctor.mjs preflight; bootstrap/quick-setup/initialize; .vscode/launch.json+settings; create-package.mjs wires tsconfig/coverage; husky pre-commit/commit-msg/pre-push; closed DX issues #150-#154"
        },
        "9": {
          "score": 8,
          "evidence": "pnpm ai:doctor exit 0: skills valid, MCP ok, shared docs present; local install drift on kaine-scorecard (run ai:install). CONTEXT.md + ADR 0001-0009 + REVIEW.md + serena memories; 13 team skills"
        }
      },
      "findings": [
        {
          "slug": "knip-unused-graphql-codegen-typescript",
          "title": "tooling: knip fails on unused @graphql-codegen/typescript",
          "dimension": 1,
          "ladderRank": 1,
          "disposition": "open",
          "issue": 257
        },
        {
          "slug": "github-actions-billing-blocked",
          "title": "ci: GitHub Actions jobs fail to start due to account billing or spending limit",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "observed",
          "reason": "Human declined filing; account billing/spending limit is operator-owned, not a code issue"
        },
        {
          "slug": "pnpm-audit-high-debt",
          "title": "security: pnpm audit reports 25 high-severity advisories (Security workflow gate)",
          "dimension": 5,
          "ladderRank": 2,
          "disposition": "open",
          "issue": 258
        },
        {
          "slug": "coverage-mobile-app-excluded",
          "title": "testing: apps/mobile/** excluded from coverage floors",
          "dimension": 4,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Deliberate per vitest.coverage.config.ts:46-48; re-include when suite grows — not a must-fix this run"
        },
        {
          "slug": "ai-install-local-drift-scorecard",
          "title": "dx: local agent installs stale for kaine-scorecard",
          "dimension": 9,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "Local-only; fixed by pnpm ai:install — not a tracked defect"
        }
      ]
    }
  ],
  "authoredFlows": [
    {
      "id": "release-deploy",
      "title": "Release and deploy",
      "caption": "Backs dimension 6. Merge to main runs quality gates, then release:apps advances only the release branches whose app was affected.",
      "nodes": [
        { "id": "merge", "label": "Merge to main", "group": "source" },
        { "id": "gates", "label": "Quality gates\n(release.yml)", "group": "ci" },
        { "id": "version", "label": "changeset version", "group": "ci" },
        { "id": "ghrelease", "label": "GitHub release\n+ tags", "group": "ci" },
        { "id": "releaseapps", "label": "pnpm release:apps", "group": "ci" },
        { "id": "branchapi", "label": "release/api", "group": "branch" },
        { "id": "branchweb", "label": "release/web", "group": "branch" },
        { "id": "dockerapi", "label": "Dockerfile.api", "group": "image" },
        { "id": "dockerweb", "label": "Dockerfile.web", "group": "image" },
        { "id": "deploy", "label": "Deploy target", "group": "deploy" }
      ],
      "edges": [
        { "from": "merge", "to": "gates" },
        { "from": "gates", "to": "version" },
        { "from": "version", "to": "ghrelease" },
        { "from": "ghrelease", "to": "releaseapps" },
        { "from": "releaseapps", "to": "branchapi", "label": "if affected" },
        { "from": "releaseapps", "to": "branchweb", "label": "if affected" },
        { "from": "branchapi", "to": "dockerapi" },
        { "from": "branchweb", "to": "dockerweb" },
        { "from": "dockerapi", "to": "deploy" },
        { "from": "dockerweb", "to": "deploy" }
      ]
    },
    {
      "id": "runtime-request",
      "title": "Runtime request path",
      "caption": "Backs dimension 7. Every data path resolves the active organization from the session before reaching Drizzle; clients never supply an organization id.",
      "nodes": [
        { "id": "web", "label": "apps/web\n(React + Vite)", "group": "client" },
        { "id": "mobile", "label": "apps/mobile\n(Expo)", "group": "client" },
        { "id": "desktop", "label": "apps/desktop\n(Tauri)", "group": "client" },
        { "id": "yoga", "label": "GraphQL Yoga\n(apps/api)", "group": "api" },
        { "id": "auth", "label": "@repo/auth\nbetter-auth", "group": "api" },
        { "id": "scope", "label": "Active organization\nscope", "group": "api" },
        { "id": "db", "label": "@repo/db\nDrizzle", "group": "data" },
        { "id": "pg", "label": "Postgres", "group": "data" },
        { "id": "storage", "label": "@repo/storage\nS3 / MinIO", "group": "data" }
      ],
      "edges": [
        { "from": "web", "to": "yoga", "label": "cookie session" },
        { "from": "mobile", "to": "yoga", "label": "bearer" },
        { "from": "desktop", "to": "yoga", "label": "cookie session" },
        { "from": "yoga", "to": "auth" },
        { "from": "auth", "to": "scope" },
        { "from": "scope", "to": "db" },
        { "from": "db", "to": "pg" },
        { "from": "scope", "to": "storage" }
      ]
    }
  ]
}
```

<!-- scorecard:data:end -->

<!-- scorecard:generated:start -->

<!-- GENERATED REGION. Written by pnpm scorecard. Do not edit by hand. -->

### Run history

| Date       | Commit    | Mode       | Agent | Overall | Findings filed |
| ---------- | --------- | ---------- | ----- | ------- | -------------- |
| 2026-07-28 | `15102fc` | sequential | grok  | **7.3** | 2              |

### Latest scorecard — 2026-07-28 (`15102fc`, sequential)

| #   | Dimension                | Score |              | Δ   | Evidence                                                                                                                                                                                                                                                                           |
| --- | ------------------------ | ----- | ------------ | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Workspace & Boundaries   | 7.0   | `███████░░░` | —   | pnpm boundaries: 1115 files/19 packages clean; package exports on all packages/\*; typecheck:exports in ci-pr.yml:240; knip fails: unused @graphql-codegen/typescript (tooling/graphql-codegen/package.json:23)                                                                    |
| 2   | Build & Cache            | 8.0   | `████████░░` | —   | turbo.json dependsOn/inputs/outputs + documented test^build; CI shared turbo-${{ runner.os }}- restore prefix (ci-pr.yml:157-163, release.yml:58-63); globalDependencies tsconfig+workspace                                                                                        |
| 3   | CI Topology & Speed      | 7.0   | `███████░░░` | —   | ci-pr path filters + parallel coverage/docker/e2e shards (artifacts #145); knip+boundaries on PR (#142). Ops: all main/PR jobs since ~2026-07-27T14:06 fail to start — GitHub billing/spending limit (run 30278372014 annotation)                                                  |
| 4   | Testing & Coverage       | 7.0   | `███████░░░` | —   | coverage-summary.json lines 52.06% / funcs 62.24% / branches 78.29% vs floors 50/55/70 (vitest.coverage.config.ts:55-59); stricter auth/api floors; 140 unit + 5 e2e; apps/mobile/\*\* excluded from floors (config:48)                                                            |
| 5   | Dependency Hygiene       | 6.0   | `██████░░░░` | —   | pnpm-workspace.yaml catalogs + catalogs.mobile; monorepo-alignment.test.ts catalog enforcement; Dependabot+Renovate both label release:skip-changeset. pnpm audit --audit-level high: 25 high / 0 critical (exit non-zero)                                                         |
| 6   | Release & Deploy         | 8.0   | `████████░░` | —   | release.yml: check:ci+build:core+test:e2e → release:apps → changesets; origin/release/api                                                                                                                                                                                          | web exist; Dockerfile.\* digest-pinned; .changeset/config privatePackages version+tag; pnpm release:status shows pending patches/minors |
| 7   | Security Posture         | 7.0   | `███████░░░` | —   | CodeQL security-extended; Gitleaks; Trivy CRITICAL exit-code 1 (ci-pr.yml:430-437); CORS fail-closed apps/api/src/server.config.ts:53-56 + tests; org scope from session (context.auth-scope.ts). Gate scripts present; audit high debt + billing blocks live Security/CodeQL runs |
| 8   | DX & Onboarding          | 8.0   | `████████░░` | —   | scripts/doctor.mjs preflight; bootstrap/quick-setup/initialize; .vscode/launch.json+settings; create-package.mjs wires tsconfig/coverage; husky pre-commit/commit-msg/pre-push; closed DX issues #150-#154                                                                         |
| 9   | Docs & Agent Scaffolding | 8.0   | `████████░░` | —   | pnpm ai:doctor exit 0: skills valid, MCP ok, shared docs present; local install drift on kaine-scorecard (run ai:install). CONTEXT.md + ADR 0001-0009 + REVIEW.md + serena memories; 13 team skills                                                                                |

**Overall: 7.3**

### Findings

| Slug                                     | Dimension | Ladder | Disposition | Issue | Title                                                                             |
| ---------------------------------------- | --------- | ------ | ----------- | ----- | --------------------------------------------------------------------------------- |
| `knip-unused-graphql-codegen-typescript` | 1         | 1      | open        | #257  | tooling: knip fails on unused @graphql-codegen/typescript                         |
| `github-actions-billing-blocked`         | 3         | 1      | observed    | —     | ci: GitHub Actions jobs fail to start due to account billing or spending limit    |
| `pnpm-audit-high-debt`                   | 5         | 2      | open        | #258  | security: pnpm audit reports 25 high-severity advisories (Security workflow gate) |
| `coverage-mobile-app-excluded`           | 4         | 6      | observed    | —     | testing: apps/mobile/\*\* excluded from coverage floors                           |
| `ai-install-local-drift-scorecard`       | 9         | 9      | observed    | —     | dx: local agent installs stale for kaine-scorecard                                |

<!-- scorecard:generated:end -->

## Calibration notes

Binding on later runs. Each note records a judgment that should not be silently re-litigated: why a dimension sits where it does, or why a previous score was corrected.

### 2026-07-28 — first baseline (`15102fc`, sequential)

- **Baseline run.** Empty `runs` array before this date; all scores are initial calibration, not deltas. Mode is `sequential` (shared-context sweep, not nine parallel explorers) — compare later fan-out runs carefully.
- **CI topology vs billing.** Dimension 3 scores the job DAG and gate placement (path filters, single coverage run, shared Turbo cache, e2e artifact reuse). It does **not** drop below 7 solely because GitHub Actions refuses to start jobs for account billing/spending limits. That operational failure is tracked as finding `github-actions-billing-blocked`. If billing is fixed and topology is unchanged, do not raise dim 3 above 8 without a concrete topology improvement.
- **Knip is a hard gate.** `pnpm check` / `check:ci` / PR `check-fast` all run knip. A single unused dep (`@graphql-codegen/typescript`) currently fails the gate locally — dim 1 is 7 (solid mechanisms, one broken contract on main), not 9.
- **Audit high debt.** Dim 5 is 6 because catalog discipline is strong but `pnpm audit --audit-level high` is red (25 high). Many paths are Expo CLI / vitest→vite transitive; do not treat every advisory as a direct product CVE when scoring security vs hygiene.
- **Security app posture.** Dim 7 stays 7: CORS fail-closed, org session scope, digest-pinned images, Trivy CRITICAL hard gate, CodeQL+Gitleaks configured. Live workflow greenness is blocked by the same billing issue as dim 3.
- **Coverage mobile exclusion.** `apps/mobile/**` outside floors is intentional (measured ~3% app shell); do not ding dim 4 for that without a decision to re-include.
