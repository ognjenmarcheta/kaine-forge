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
    },
    {
      "date": "2026-08-21",
      "commit": "4cbdfeb8e803ea7c2d7c7fa7d3bee4c765ab8506",
      "mode": "sequential",
      "agent": "opencode",
      "overall": 7.3,
      "dimensions": {
        "1": {
          "score": 7,
          "evidence": "Prior knip red fixed (#279) but new red: pnpm knip exits 1 on 'Unlisted binaries (1): gitleaks' from root package.json scan:secrets script; hard gate still red on main for a trivial reason"
        },
        "2": {
          "score": 8,
          "evidence": "turbo.json unchanged: dependsOn/inputs/outputs per task, load-bearing test^build documented (turbo.json:62), globalDependencies tsconfig.base+pnpm-workspace (turbo.json:4)"
        },
        "3": {
          "score": 7,
          "evidence": "Topology unchanged; billing blocker persists: run 32381948978 annotation confirms jobs fail to start (~4s) across Release/Security/CodeQL/PR workflows (2026-08-20)",
          "calibration": "Per 2026-07-28 note: scores topology design, not account billing. Impact escalated since baseline — releases frozen ~3 weeks."
        },
        "4": {
          "score": 7,
          "evidence": "coverage-summary.json lines 52.06 / funcs 62.24 / branches 78.29 vs floors 50/55/70 (vitest.coverage.config.ts); data stale since Jul 25 because CI cannot run; ec589f0 added commitlint/doc-contract/script tests to PRs"
        },
        "5": {
          "score": 6,
          "evidence": "pnpm audit --audit-level high: 19 high / 0 critical, exit non-zero (down from 25 after #285 + overrides pnpm-workspace.yaml:61-73); catalogs and both bots intact; gate still red"
        },
        "6": {
          "score": 8,
          "evidence": "Mechanism intact: origin/release/api + release/web exist, release.yml gates, Dockerfile.* digest-pinned; downstream billing impact: release branches stale since Jul 29 vs main Aug 20, five changesets unversioned"
        },
        "7": {
          "score": 7,
          "evidence": "Gitleaks action SHA-pinned (security.yml:54), CodeQL v4 SHA-pinned (codeql.yml:36,52); SECURITY.md + kaine-secret-scan skill added (#286); audit debt down 25→19; live Security/CodeQL runs billing-blocked"
        },
        "8": {
          "score": 8,
          "evidence": "doctor.mjs/bootstrap/quick-setup intact; anti-slop lint rules adopted (#282), decision ladder (#283), README agent-ready section (#284)"
        },
        "9": {
          "score": 8,
          "evidence": "pnpm ai:doctor exit 0: all agent installs valid, zero drift (baseline kaine-scorecard drift cleared); strict drift gate (#281); team skills 13→15"
        }
      },
      "findings": [
        {
          "slug": "github-actions-billing-blocked",
          "title": "ci: GitHub Actions jobs fail to start due to account billing or spending limit",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "observed",
          "reason": "Persists from baseline; operator-owned. Impact escalated: releases frozen ~3 weeks (release/api Jul 29 vs main Aug 20), changesets unversioned, Security/CodeQL not running"
        },
        {
          "slug": "knip-unlisted-gitleaks-binary",
          "title": "tooling: knip fails on unlisted gitleaks binary",
          "dimension": 1,
          "ladderRank": 2,
          "disposition": "open",
          "issue": 288
        },
        {
          "slug": "pnpm-audit-high-debt",
          "title": "security: pnpm audit reports high-severity advisories (Security workflow gate)",
          "dimension": 5,
          "ladderRank": 3,
          "disposition": "open",
          "issue": 258
        }
      ]
    },
    {
      "date": "2026-08-21",
      "commit": "aef4493afaea0dfa4e573322b22c939d7986392c",
      "mode": "sequential",
      "agent": "opencode",
      "overall": 7.4,
      "dimensions": {
        "1": {
          "score": 8,
          "evidence": "pnpm knip green on main (#289 merged); boundaries/typecheck:exports mechanisms unchanged; hard-gate red from both prior runs resolved"
        },
        "2": {
          "score": 8,
          "evidence": "turbo.json unchanged; vite 8 (Rolldown) migrated cleanly with full validation ladder incl. e2e 5/5 and build:core 14/14 (#291)"
        },
        "3": {
          "score": 7,
          "evidence": "Topology unchanged; billing persists: all workflows on the #292 merge failed to start in ~4-5s (runs 32470963xxx, 2026-08-21T10:04Z)",
          "calibration": "Per 2026-07-28 note: scores topology design, not account billing."
        },
        "4": {
          "score": 7,
          "evidence": "coverage-summary.json unchanged since Jul 25 (lines 52.06 vs floor 50); no new tests landed this window; doctor now self-reports coverage staleness (#292)"
        },
        "5": {
          "score": 6,
          "evidence": "pnpm audit --audit-level high after vite 8 (#291) and Cargo refresh (#290): still 19 high / 0 critical — expected improvement tested and rejected; gate still red (#258)"
        },
        "6": {
          "score": 8,
          "evidence": "Mechanism intact; release/api frozen at Jul 29 vs main Aug 21, six pending changesets — downstream billing impact scored per calibration"
        },
        "7": {
          "score": 7,
          "evidence": "Gitleaks/CodeQL SHA-pinned unchanged; Security+CodeQL dark (billing); audit debt unchanged at 19 high"
        },
        "8": {
          "score": 8,
          "evidence": "doctor.mjs gained tracker-label and coverage-freshness gates with unit tests (#292); bootstrap/quick-setup/husky intact"
        },
        "9": {
          "score": 8,
          "evidence": "ai:doctor zero drift across three installs today; labeler/tracker drift eliminated and encoded as a doctor gate (#292); skills valid; holds at 8 pending gates proving over time"
        }
      },
      "findings": [
        {
          "slug": "github-actions-billing-blocked",
          "title": "ci: GitHub Actions jobs fail to start due to account billing or spending limit",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "observed",
          "reason": "Third consecutive run observing the blocker; operator-owned, resolves at go-public per maintainer"
        },
        {
          "slug": "knip-unlisted-gitleaks-binary",
          "title": "tooling: knip fails on unlisted gitleaks binary",
          "dimension": 1,
          "ladderRank": 2,
          "disposition": "fixed",
          "issue": 288
        },
        {
          "slug": "pnpm-audit-high-debt",
          "title": "security: pnpm audit reports high-severity advisories (Security workflow gate)",
          "dimension": 5,
          "ladderRank": 3,
          "disposition": "open",
          "issue": 258
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

| Date       | Commit    | Mode       | Agent    | Overall | Findings filed |
| ---------- | --------- | ---------- | -------- | ------- | -------------- |
| 2026-08-21 | `aef4493` | sequential | opencode | **7.4** | 2              |
| 2026-08-21 | `4cbdfeb` | sequential | opencode | **7.3** | 2              |
| 2026-07-28 | `15102fc` | sequential | grok     | **7.3** | 2              |

### Latest scorecard — 2026-08-21 (`aef4493`, sequential)

| #   | Dimension                | Score |              | Δ   | Evidence                                                                                                                                                                         |
| --- | ------------------------ | ----- | ------------ | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Workspace & Boundaries   | 8.0   | `████████░░` | ▲+1 | pnpm knip green on main (#289 merged); boundaries/typecheck:exports mechanisms unchanged; hard-gate red from both prior runs resolved                                            |
| 2   | Build & Cache            | 8.0   | `████████░░` | 0   | turbo.json unchanged; vite 8 (Rolldown) migrated cleanly with full validation ladder incl. e2e 5/5 and build:core 14/14 (#291)                                                   |
| 3   | CI Topology & Speed      | 7.0   | `███████░░░` | 0   | Topology unchanged; billing persists: all workflows on the #292 merge failed to start in ~4-5s (runs 32470963xxx, 2026-08-21T10:04Z)                                             |
| 4   | Testing & Coverage       | 7.0   | `███████░░░` | 0   | coverage-summary.json unchanged since Jul 25 (lines 52.06 vs floor 50); no new tests landed this window; doctor now self-reports coverage staleness (#292)                       |
| 5   | Dependency Hygiene       | 6.0   | `██████░░░░` | 0   | pnpm audit --audit-level high after vite 8 (#291) and Cargo refresh (#290): still 19 high / 0 critical — expected improvement tested and rejected; gate still red (#258)         |
| 6   | Release & Deploy         | 8.0   | `████████░░` | 0   | Mechanism intact; release/api frozen at Jul 29 vs main Aug 21, six pending changesets — downstream billing impact scored per calibration                                         |
| 7   | Security Posture         | 7.0   | `███████░░░` | 0   | Gitleaks/CodeQL SHA-pinned unchanged; Security+CodeQL dark (billing); audit debt unchanged at 19 high                                                                            |
| 8   | DX & Onboarding          | 8.0   | `████████░░` | 0   | doctor.mjs gained tracker-label and coverage-freshness gates with unit tests (#292); bootstrap/quick-setup/husky intact                                                          |
| 9   | Docs & Agent Scaffolding | 8.0   | `████████░░` | 0   | ai:doctor zero drift across three installs today; labeler/tracker drift eliminated and encoded as a doctor gate (#292); skills valid; holds at 8 pending gates proving over time |

**Overall: 7.4** (▲+0.1)

### Findings

| Slug                             | Dimension | Ladder | Disposition | Issue | Title                                                                          |
| -------------------------------- | --------- | ------ | ----------- | ----- | ------------------------------------------------------------------------------ |
| `github-actions-billing-blocked` | 3         | 1      | observed    | —     | ci: GitHub Actions jobs fail to start due to account billing or spending limit |
| `knip-unlisted-gitleaks-binary`  | 1         | 2      | fixed       | #288  | tooling: knip fails on unlisted gitleaks binary                                |
| `pnpm-audit-high-debt`           | 5         | 3      | open        | #258  | security: pnpm audit reports high-severity advisories (Security workflow gate) |

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

### 2026-08-21 — second run (`4cbdfeb`, sequential)

- **Billing blocker persists into a second run.** All workflows still fail to start (~4s); releases frozen (release/api last advanced Jul 29, main at Aug 20), five changesets unversioned, Security/CodeQL dark. Dims 3 and 6 continue to score mechanism design per the 2026-07-28 calibration; operational impact stays in finding `github-actions-billing-blocked`. Resolving billing is the single highest-leverage action for this repo.
- **Audit debt trend.** High advisories fell 25 → 19 after #285 consolidated bot bumps and added transitive security floors (`pnpm-workspace.yaml` overrides). Dim 5 stays 6 until `pnpm audit --audit-level high` exits 0; treat remaining highs as mostly transitive (vitest→vite→postcss).
- **Knip red swapped, not cleared.** #257 (unused codegen dep) was fixed via #279, but a new unlisted-binary red (`gitleaks`) appeared. Dim 1 stays 7 under the same hard-gate logic as baseline; fix tracked as `knip-unlisted-gitleaks-binary` (#288).
- **AI scaffolding drift cleared.** Baseline's local kaine-scorecard install drift is gone; doctor now gates drift strictly (#281). Dim 9 holds at 8 — band 9 requires a proven regression gate across agents, not just doctor greenness.

### 2026-08-21 — same-day third run (`aef4493`, sequential)

- **Dim 1 → 8 with concrete cause.** The knip hard-gate red that capped both prior runs is resolved (#289 merged); band descriptor "the right mechanism exists and works" now fully holds for workspace boundaries.
- **Dim 5 held at 6 — expectation explicitly tested and rejected.** vite 8 (#291) and the in-range Cargo refresh (#290) did not move `pnpm audit --audit-level high` (19 high before and after). Do not raise dim 5 without the audit gate going green.
- **Label-drift class closed and encoded.** #292 created the missing desktop labels, removed the prose warning from the kaine-scorecard skill, and added a doctor gate validating labeler.yml against the tracker. Future drift FAILs bootstrap instead of failing PR creation.
- **Coverage staleness is now self-reported.** doctor flags `coverage-summary.json` older than 14 days (informational). Dim 4 stays 7 until floors gain headroom or router-layer tests land.
- **Overall 7.3 → 7.4.** Movement is dim 1 only; all other dimensions re-evidenced flat.
