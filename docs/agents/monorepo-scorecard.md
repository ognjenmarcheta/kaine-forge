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
    },
    {
      "date": "2026-09-08",
      "commit": "5f6f91f9957481a3645c25c07948d65c81535bc9",
      "mode": "sequential",
      "agent": "claude",
      "overall": 7,
      "dimensions": {
        "1": {
          "score": 7,
          "evidence": "knip green; boundaries green in CI (red locally on gitignored src-tauri/target); packages/storage/src/index.ts:4 barrel re-exports the AWS S3 client into web+mobile — Expo export red on every Deep Checks run since jobs execute (34199443237, 33848740914, 33484859563); @repo/logger barrel also reaches mobile; no ESLint/boundaries/test gate separates client-safe from server-only surface (base.js:50-105, no turbo tags) (#305)"
        },
        "2": {
          "score": 7,
          "evidence": "Global hash still 2 files + NODE_ENV (dry-run); typecheck tasks have dependencies=[] while reading sibling src via tsconfig.base.json:21-54 and packages/config/typescript/* — reproduced: storage src edit left web/api/mobile typecheck on cache HITs; lint/format:check inputs omit shared config; mitigated by uncached typecheck:exports:run + mobile-typecheck (#308)"
        },
        "3": {
          "score": 7,
          "evidence": "Topology unchanged; billing cleared ~2026-09-01 (CodeQL 34126323459 green, Deep Checks executes); last green PR wall-clock ~4 min (30267187333: Check Fast 52s, Coverage 2m09s, e2e shards ~1m40s); mobile export gate runs twice weekly only; branch protection/required checks unavailable on private free plan",
          "calibration": "Per 2026-07-28 note: scores topology design. Billing resolved; the mobile export red is an export-contract defect scored under dim 1."
        },
        "4": {
          "score": 7,
          "evidence": "coverage-summary.json still 2026-07-25 (lines 52.06 / funcs 62.24 / branches 78.29 vs floors 50/55/70); no CI coverage run since 07-27; probe: no test executes a GraphQL operation against the schema, no cross-organization isolation test (#309), web feature tests are source-string assertions — floors hold but depth is thin"
        },
        "5": {
          "score": 5,
          "evidence": "pnpm audit --audit-level high: 25 high (19 on 08-21; fast-uri via commitlint, browserslist); Dependabot security updates error security_update_not_possible (34081415606); 10 bot PRs stale since 08-24 incl. policy-violating #300/#301 (dependabot.yml:20-28 misses @expo/*); renovate.json inert (0 Renovate PRs, no dashboard) and dependabot.yml npm-only so action/image digests never refresh (Dockerfile digests since 07-27) (#306, #258)"
        },
        "6": {
          "score": 8,
          "evidence": "Mechanism intact (release.yml gates, digest-pinned Dockerfiles, changesets config); release/api 04df1c8 and release/web d05bc9a frozen at 07-29 vs main 08-27, 6 changesets pending; billing cleared but no push since — next merge or workflow_dispatch exercises the path"
        },
        "7": {
          "score": 7,
          "evidence": "CodeQL green (upload never: private plan), Gitleaks green, Trivy CRITICAL gate + SBOM in ci-pr; org scope from session at every resolver (~35 requireOrganizationScope sites), CORS fail-closed, secret entropy; audit gate red 25 high, 22 high Dependabot alerts open; SHA/digest pins have no refresh mechanism; introspection/complexity gates lack behavior tests"
        },
        "8": {
          "score": 7,
          "evidence": "Documented pnpm doctor (README.md:115, docs/troubleshooting.md:5) runs pnpm's built-in, never scripts/doctor.mjs (#307); pnpm check red locally after a desktop build (boundaries reads src-tauri/target); bootstrap/quick-setup/husky/.vscode intact, create-package honest, every other documented command exists and accepts its flags"
        },
        "9": {
          "score": 8,
          "evidence": "ai:doctor zero drift across 5 installs; 15 skills valid; 9 ADRs; REVIEW 9 headings; serena memories verified accurate against scripts/.nvmrc/workspace; stale claims MONOREPO_GUIDE.md:57 + kaine-triage-deps.md:9-43 (Renovate) and CONTRIBUTING.md:142 (required checks) fold into #306; strict drift gate not yet proven in CI since billing"
        }
      },
      "findings": [
        {
          "slug": "mobile-export-storage-node-only-barrel",
          "title": "storage: @repo/storage barrel pulls @aws-sdk/client-s3 into the Expo bundle and breaks expo export",
          "dimension": 1,
          "ladderRank": 1,
          "disposition": "open",
          "issue": 305
        },
        {
          "slug": "turbo-typecheck-hash-omits-cross-package-inputs",
          "title": "build: turbo typecheck and lint hashes omit cross-package source and shared config, so affected runs hit stale cache",
          "dimension": 2,
          "ladderRank": 1,
          "disposition": "open",
          "issue": 308
        },
        {
          "slug": "doctor-script-shadowed-by-pnpm-builtin",
          "title": "dx: documented pnpm doctor runs pnpm's built-in doctor, never scripts/doctor.mjs",
          "dimension": 8,
          "ladderRank": 1,
          "disposition": "open",
          "issue": 307
        },
        {
          "slug": "github-actions-billing-blocked",
          "title": "ci: GitHub Actions jobs fail to start due to account billing or spending limit",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "fixed",
          "reason": "Jobs execute since ~2026-09-01 (CodeQL 34126323459 green 09-07); operator resolved billing. Release still unexercised: no push to main since 08-27"
        },
        {
          "slug": "renovate-inert-digest-refresh-absent",
          "title": "deps: renovate.json is inert and dependabot.yml covers only npm, so action SHAs and image digests never refresh",
          "dimension": 5,
          "ladderRank": 2,
          "disposition": "open",
          "issue": 306
        },
        {
          "slug": "pnpm-audit-high-debt",
          "title": "security: pnpm audit reports high-severity advisories (Security workflow gate)",
          "dimension": 5,
          "ladderRank": 3,
          "disposition": "open",
          "issue": 258,
          "reason": "Regressed 19→25 high; commented on #258 with the fast-uri/browserslist paths and the overrides pattern"
        },
        {
          "slug": "no-cross-organization-isolation-test",
          "title": "testing: no test asserts cross-organization isolation end to end",
          "dimension": 4,
          "ladderRank": 4,
          "disposition": "open",
          "issue": 309
        },
        {
          "slug": "hardening-gates-untested",
          "title": "security: introspection-off, depth/complexity, and confirm-time content-type gates have no behavior test",
          "dimension": 7,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Gates exist (server.config.ts:223-225, server.ts:97-101, storage.lifecycle.ts:174-182); missing tests below the filing bar this run — fold into #309's test work"
        },
        {
          "slug": "web-tests-source-string-assertions",
          "title": "testing: web feature tests assert on source text, no rendered component tests",
          "dimension": 4,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Depth, not a broken gate; dashboard-overview.test.ts:1-9, login-form.test.ts, todos.route.test.ts"
        },
        {
          "slug": "release-branches-frozen-since-jul-29",
          "title": "release: release/api and release/web frozen at 2026-07-29 while main is at 2026-08-27",
          "dimension": 6,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Mechanism intact; resolves on the next push to main or a Release workflow_dispatch now that billing is cleared"
        },
        {
          "slug": "branch-protection-unavailable-private-plan",
          "title": "ci: no required status checks — branch protection and rulesets unavailable on the private free plan",
          "dimension": 3,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Plan-limited (API 403); resolves at go-public; merge_group trigger in ci-pr.yml is inert until then"
        },
        {
          "slug": "code-scanning-disabled-private-plan",
          "title": "security: code scanning not enabled, so CodeQL and Trivy results never reach the Security tab",
          "dimension": 7,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Plan-limited; workflows already gate uploads on visibility/ENABLE_GITHUB_CODE_SCANNING; resolves at go-public"
        },
        {
          "slug": "dependabot-prs-stale-untriaged",
          "title": "deps: 10 Dependabot PRs open since 2026-08-24 (#294–#303)",
          "dimension": 5,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "Workflow task, not a defect — run kaine-triage-deps; #300/#301 conflict with the mobile pin policy (see #306)"
        },
        {
          "slug": "boundaries-local-red-tauri-target",
          "title": "tooling: turbo boundaries fails locally on gitignored apps/desktop/src-tauri/target output",
          "dimension": 8,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Local-only after a desktop build; workaround pnpm --filter @repo/desktop clean; undocumented in troubleshooting — lower ladder tier"
        },
        {
          "slug": "coverage-evidence-stale",
          "title": "testing: coverage-summary.json is 45 days old",
          "dimension": 4,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "User chose not to refresh locally this run; doctor self-reports the age"
        },
        {
          "slug": "translation-team-language-drift",
          "title": "i18n: dashboard.json uses Teams/squads/timove where CONTEXT mandates Organization",
          "dimension": 9,
          "ladderRank": 11,
          "disposition": "observed",
          "reason": "packages/translation/src/locales/{de,en,sr}/dashboard.json:4; trivial fix, lowest ladder tier"
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
        {
          "id": "merge",
          "label": "Merge to main",
          "group": "source"
        },
        {
          "id": "gates",
          "label": "Quality gates\n(release.yml)",
          "group": "ci"
        },
        {
          "id": "version",
          "label": "changeset version",
          "group": "ci"
        },
        {
          "id": "ghrelease",
          "label": "GitHub release\n+ tags",
          "group": "ci"
        },
        {
          "id": "releaseapps",
          "label": "pnpm release:apps",
          "group": "ci"
        },
        {
          "id": "branchapi",
          "label": "release/api",
          "group": "branch"
        },
        {
          "id": "branchweb",
          "label": "release/web",
          "group": "branch"
        },
        {
          "id": "dockerapi",
          "label": "Dockerfile.api",
          "group": "image"
        },
        {
          "id": "dockerweb",
          "label": "Dockerfile.web",
          "group": "image"
        },
        {
          "id": "deploy",
          "label": "Deploy target",
          "group": "deploy"
        }
      ],
      "edges": [
        {
          "from": "merge",
          "to": "gates"
        },
        {
          "from": "gates",
          "to": "version"
        },
        {
          "from": "version",
          "to": "ghrelease"
        },
        {
          "from": "ghrelease",
          "to": "releaseapps"
        },
        {
          "from": "releaseapps",
          "to": "branchapi",
          "label": "if affected"
        },
        {
          "from": "releaseapps",
          "to": "branchweb",
          "label": "if affected"
        },
        {
          "from": "branchapi",
          "to": "dockerapi"
        },
        {
          "from": "branchweb",
          "to": "dockerweb"
        },
        {
          "from": "dockerapi",
          "to": "deploy"
        },
        {
          "from": "dockerweb",
          "to": "deploy"
        }
      ]
    },
    {
      "id": "runtime-request",
      "title": "Runtime request path",
      "caption": "Backs dimension 7. Every data path resolves the active organization from the session before reaching Drizzle; clients never supply an organization id.",
      "nodes": [
        {
          "id": "web",
          "label": "apps/web\n(React + Vite)",
          "group": "client"
        },
        {
          "id": "mobile",
          "label": "apps/mobile\n(Expo)",
          "group": "client"
        },
        {
          "id": "desktop",
          "label": "apps/desktop\n(Tauri)",
          "group": "client"
        },
        {
          "id": "yoga",
          "label": "GraphQL Yoga\n(apps/api)",
          "group": "api"
        },
        {
          "id": "auth",
          "label": "@repo/auth\nbetter-auth",
          "group": "api"
        },
        {
          "id": "scope",
          "label": "Active organization\nscope",
          "group": "api"
        },
        {
          "id": "db",
          "label": "@repo/db\nDrizzle",
          "group": "data"
        },
        {
          "id": "pg",
          "label": "Postgres",
          "group": "data"
        },
        {
          "id": "storage",
          "label": "@repo/storage\nS3 / MinIO",
          "group": "data"
        }
      ],
      "edges": [
        {
          "from": "web",
          "to": "yoga",
          "label": "cookie session"
        },
        {
          "from": "mobile",
          "to": "yoga",
          "label": "bearer"
        },
        {
          "from": "desktop",
          "to": "yoga",
          "label": "cookie session"
        },
        {
          "from": "yoga",
          "to": "auth"
        },
        {
          "from": "auth",
          "to": "scope"
        },
        {
          "from": "scope",
          "to": "db"
        },
        {
          "from": "db",
          "to": "pg"
        },
        {
          "from": "scope",
          "to": "storage"
        }
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
| 2026-09-08 | `5f6f91f` | sequential | claude   | **7**   | 6              |
| 2026-08-21 | `aef4493` | sequential | opencode | **7.4** | 2              |
| 2026-08-21 | `4cbdfeb` | sequential | opencode | **7.3** | 2              |
| 2026-07-28 | `15102fc` | sequential | grok     | **7.3** | 2              |

### Latest scorecard — 2026-09-08 (`5f6f91f`, sequential)

| #   | Dimension                | Score |              | Δ   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------ | ----- | ------------ | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Workspace & Boundaries   | 7.0   | `███████░░░` | ▼-1 | knip green; boundaries green in CI (red locally on gitignored src-tauri/target); packages/storage/src/index.ts:4 barrel re-exports the AWS S3 client into web+mobile — Expo export red on every Deep Checks run since jobs execute (34199443237, 33848740914, 33484859563); @repo/logger barrel also reaches mobile; no ESLint/boundaries/test gate separates client-safe from server-only surface (base.js:50-105, no turbo tags) (#305)          |
| 2   | Build & Cache            | 7.0   | `███████░░░` | ▼-1 | Global hash still 2 files + NODE_ENV (dry-run); typecheck tasks have dependencies=[] while reading sibling src via tsconfig.base.json:21-54 and packages/config/typescript/* — reproduced: storage src edit left web/api/mobile typecheck on cache HITs; lint/format:check inputs omit shared config; mitigated by uncached typecheck:exports:run + mobile-typecheck (#308)                                                                        |
| 3   | CI Topology & Speed      | 7.0   | `███████░░░` | 0   | Topology unchanged; billing cleared ~2026-09-01 (CodeQL 34126323459 green, Deep Checks executes); last green PR wall-clock ~4 min (30267187333: Check Fast 52s, Coverage 2m09s, e2e shards ~1m40s); mobile export gate runs twice weekly only; branch protection/required checks unavailable on private free plan                                                                                                                                  |
| 4   | Testing & Coverage       | 7.0   | `███████░░░` | 0   | coverage-summary.json still 2026-07-25 (lines 52.06 / funcs 62.24 / branches 78.29 vs floors 50/55/70); no CI coverage run since 07-27; probe: no test executes a GraphQL operation against the schema, no cross-organization isolation test (#309), web feature tests are source-string assertions — floors hold but depth is thin                                                                                                                |
| 5   | Dependency Hygiene       | 5.0   | `█████░░░░░` | ▼-1 | pnpm audit --audit-level high: 25 high (19 on 08-21; fast-uri via commitlint, browserslist); Dependabot security updates error security_update_not_possible (34081415606); 10 bot PRs stale since 08-24 incl. policy-violating #300/#301 (dependabot.yml:20-28 misses @expo/*); renovate.json inert (0 Renovate PRs, no dashboard) and dependabot.yml npm-only so action/image digests never refresh (Dockerfile digests since 07-27) (#306, #258) |
| 6   | Release & Deploy         | 8.0   | `████████░░` | 0   | Mechanism intact (release.yml gates, digest-pinned Dockerfiles, changesets config); release/api 04df1c8 and release/web d05bc9a frozen at 07-29 vs main 08-27, 6 changesets pending; billing cleared but no push since — next merge or workflow_dispatch exercises the path                                                                                                                                                                        |
| 7   | Security Posture         | 7.0   | `███████░░░` | 0   | CodeQL green (upload never: private plan), Gitleaks green, Trivy CRITICAL gate + SBOM in ci-pr; org scope from session at every resolver (~35 requireOrganizationScope sites), CORS fail-closed, secret entropy; audit gate red 25 high, 22 high Dependabot alerts open; SHA/digest pins have no refresh mechanism; introspection/complexity gates lack behavior tests                                                                             |
| 8   | DX & Onboarding          | 7.0   | `███████░░░` | ▼-1 | Documented pnpm doctor (README.md:115, docs/troubleshooting.md:5) runs pnpm's built-in, never scripts/doctor.mjs (#307); pnpm check red locally after a desktop build (boundaries reads src-tauri/target); bootstrap/quick-setup/husky/.vscode intact, create-package honest, every other documented command exists and accepts its flags                                                                                                          |
| 9   | Docs & Agent Scaffolding | 8.0   | `████████░░` | 0   | ai:doctor zero drift across 5 installs; 15 skills valid; 9 ADRs; REVIEW 9 headings; serena memories verified accurate against scripts/.nvmrc/workspace; stale claims MONOREPO_GUIDE.md:57 + kaine-triage-deps.md:9-43 (Renovate) and CONTRIBUTING.md:142 (required checks) fold into #306; strict drift gate not yet proven in CI since billing                                                                                                    |

**Overall: 7** (▼-0.4)

### Findings

| Slug                                              | Dimension | Ladder | Disposition | Issue | Title                                                                                                                |
| ------------------------------------------------- | --------- | ------ | ----------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| `mobile-export-storage-node-only-barrel`          | 1         | 1      | open        | #305  | storage: @repo/storage barrel pulls @aws-sdk/client-s3 into the Expo bundle and breaks expo export                   |
| `turbo-typecheck-hash-omits-cross-package-inputs` | 2         | 1      | open        | #308  | build: turbo typecheck and lint hashes omit cross-package source and shared config, so affected runs hit stale cache |
| `doctor-script-shadowed-by-pnpm-builtin`          | 8         | 1      | open        | #307  | dx: documented pnpm doctor runs pnpm's built-in doctor, never scripts/doctor.mjs                                     |
| `github-actions-billing-blocked`                  | 3         | 1      | fixed       | —     | ci: GitHub Actions jobs fail to start due to account billing or spending limit                                       |
| `renovate-inert-digest-refresh-absent`            | 5         | 2      | open        | #306  | deps: renovate.json is inert and dependabot.yml covers only npm, so action SHAs and image digests never refresh      |
| `pnpm-audit-high-debt`                            | 5         | 3      | open        | #258  | security: pnpm audit reports high-severity advisories (Security workflow gate)                                       |
| `no-cross-organization-isolation-test`            | 4         | 4      | open        | #309  | testing: no test asserts cross-organization isolation end to end                                                     |
| `hardening-gates-untested`                        | 7         | 4      | observed    | —     | security: introspection-off, depth/complexity, and confirm-time content-type gates have no behavior test             |
| `web-tests-source-string-assertions`              | 4         | 4      | observed    | —     | testing: web feature tests assert on source text, no rendered component tests                                        |
| `release-branches-frozen-since-jul-29`            | 6         | 4      | observed    | —     | release: release/api and release/web frozen at 2026-07-29 while main is at 2026-08-27                                |
| `branch-protection-unavailable-private-plan`      | 3         | 5      | observed    | —     | ci: no required status checks — branch protection and rulesets unavailable on the private free plan                  |
| `code-scanning-disabled-private-plan`             | 7         | 5      | observed    | —     | security: code scanning not enabled, so CodeQL and Trivy results never reach the Security tab                        |
| `dependabot-prs-stale-untriaged`                  | 5         | 7      | observed    | —     | deps: 10 Dependabot PRs open since 2026-08-24 (#294–#303)                                                            |
| `boundaries-local-red-tauri-target`               | 8         | 8      | observed    | —     | tooling: turbo boundaries fails locally on gitignored apps/desktop/src-tauri/target output                           |
| `coverage-evidence-stale`                         | 4         | 9      | observed    | —     | testing: coverage-summary.json is 45 days old                                                                        |
| `translation-team-language-drift`                 | 9         | 11     | observed    | —     | i18n: dashboard.json uses Teams/squads/timove where CONTEXT mandates Organization                                    |

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

### 2026-09-08 — fourth run (`5f6f91f`, sequential + three explorer probes)

- **Billing cleared; `github-actions-billing-blocked` → fixed.** Jobs execute since ~2026-09-01 (CodeQL 34126323459 green on 09-07). No push to main since 08-27, so Release is still unexercised; dim 6 holds at 8 per the 07-28 mechanism-not-billing rule.
- **Depth note.** Mode stays `sequential` (shared-context sweep), but three read-only `kaine-explorer` probes covered dims 1/2, 4/7, and 8/9. The drops in dims 2 and 8 are depth-driven discoveries that existed in earlier runs undetected; dims 1 and 5 are real regressions. Later runs must probe at least this deep before comparing deltas.
- **Mobile export red scored under dim 1, not dim 3.** The `expo export` failure is a package export-contract defect (`@repo/storage` barrel re-exports the S3 client), so dim 1 → 7 (#305). Dim 3 keeps scoring topology, unchanged at 7. Do not raise dim 1 above 7 until a gate separates client-safe from server-only package surface.
- **Dim 2 → 7 with reproduced cause.** `typecheck` has no dependency edge and omits shared-config inputs; a `packages/storage` source edit left web/api/mobile typecheck on cache HITs (#308). Do not raise dim 2 until invalidation is proven by a dry-run assertion or test.
- **Dim 5 → 5 with cause.** Audit 19→25 high (regression on #258), Dependabot security updates erroring, and the digest-refresh mechanism found absent (`renovate.json` inert, `dependabot.yml` npm-only, #306). Raise back to 6 when #306 lands; to 7+ only with the audit gate green.
- **Dim 8 → 7 with cause.** The documented `pnpm doctor` is shadowed by pnpm's built-in (#307); earlier runs credited it as a working gate. Local `pnpm check` red on gitignored `src-tauri/target` is recorded as observed, not filed.
- **Dim 4 held at 7 despite thinner depth than assumed.** Floors hold and the gate works; the missing cross-organization isolation test is filed (#309); schema-level and rendered-component gaps are observed. Coverage evidence unchanged since 07-25 by user choice (no local refresh this run).
- **Dim 9 held at 8.** Serena memories verified accurate; three stale mechanism claims (Renovate ×2, required checks) fold into #306.
- **Overall 7.4 → 7.0.** Two regressions (dims 1, 5) plus two depth discoveries (dims 2, 8); dims 3, 4, 6, 7, 9 re-evidenced flat.
