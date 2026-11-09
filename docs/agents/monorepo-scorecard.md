# Monorepo Health Scorecard

Repeatable, evidence-bound health scoring for this monorepo. Produced by the `kaine-scorecard` skill; `pnpm scorecard` renders the generated region, and the agent desk's **Scorecard** view shows it.

This file is the source of truth. It holds the band descriptors, every run's scores and evidence, the finding slugs that prevent duplicate issues, and the calibration notes that bind later runs.

## How to read it

- **Scores** are 0-10 per dimension. Every score cites a command output or a `path:line`. Nothing is inferred from line counts — see ADR 0009 on why noisy heuristics were rejected.
- **Deltas** are meaningful only within the same `mode`. A `fan-out` run scans deeper than a `sequential` one, so compare like with like.
- **Overall** is the mean of the scored dimensions, so it is only comparable across runs that scored the same number of them. Runs before 2026-09-11 average nine dimensions; later runs average ten, once `AI & Agent Quality` has evidence. The `overall` delta across that boundary is not a comparison. Per-dimension deltas stay valid throughout.
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

| #   | Dimension                | Scope                                                                         |
| --- | ------------------------ | ----------------------------------------------------------------------------- |
| 1   | Workspace & Boundaries   | Workspace graph, package export contracts, boundary and dead-code gates       |
| 2   | Build & Cache            | Turbo task graph correctness, cache hit behavior, global hash surface         |
| 3   | CI Topology & Speed      | Job DAG, gate placement, redundant work, wall-clock                           |
| 4   | Testing & Coverage       | Coverage floors vs measured, excluded workspaces, test depth                  |
| 5   | Dependency Hygiene       | Catalog discipline, drift, audit findings, bot PR flow                        |
| 6   | Release & Deploy         | Changesets health, release branch mechanics, image build contracts            |
| 7   | Security Posture         | Scanning gates, auth and tenancy enforcement, supply-chain pinning            |
| 8   | DX & Onboarding          | First-run success, preflight checks, editor and script honesty                |
| 9   | Docs & Agent Scaffolding | AI setup health, CONTEXT/ADR/REVIEW coverage, memory accuracy                 |
| 10  | AI & Agent Quality       | Eval coverage and ledgers, model-behaviour assertions, agent-run traceability |

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
          "evidence": "ci-pr path filters + parallel coverage/docker/e2e shards (artifacts #145); knip+boundaries on PR (#142). Ops: all main/PR jobs since ~2026-07-27T14:06 fail to start — CI stoppage outside the codebase (run 30278372014 annotation)",
          "calibration": "Score reflects topology design, not the CI stoppage. Do not re-penalize design for a stoppage outside the codebase unless topology itself regressed."
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
          "evidence": "CodeQL security-extended; Gitleaks; Trivy CRITICAL exit-code 1 (ci-pr.yml:430-437); CORS fail-closed apps/api/src/server.config.ts:53-56 + tests; org scope from session (context.auth-scope.ts). Gate scripts present; audit high debt + the stoppage blocks live Security/CodeQL runs"
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
          "slug": "github-actions-jobs-not-starting",
          "title": "ci: GitHub Actions jobs fail to start (cause outside the codebase)",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "observed",
          "reason": "Not filed: the cause is outside the codebase"
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
          "evidence": "Topology unchanged; the stoppage persists: run 32381948978 annotation confirms jobs fail to start (~4s) across Release/Security/CodeQL/PR workflows (2026-08-20)",
          "calibration": "Per 2026-07-28 note: scores topology design, not the CI stoppage. Impact escalated since baseline — releases frozen ~3 weeks."
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
          "evidence": "Mechanism intact: origin/release/api + release/web exist, release.yml gates, Dockerfile.* digest-pinned; downstream impact: release branches stale since Jul 29 vs main Aug 20, five changesets unversioned"
        },
        "7": {
          "score": 7,
          "evidence": "Gitleaks action SHA-pinned (security.yml:54), CodeQL v4 SHA-pinned (codeql.yml:36,52); SECURITY.md + kaine-secret-scan skill added (#286); audit debt down 25→19; live Security/CodeQL runs blocked by the stoppage"
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
          "slug": "github-actions-jobs-not-starting",
          "title": "ci: GitHub Actions jobs fail to start (cause outside the codebase)",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "observed",
          "reason": "Persists from baseline; cause outside the codebase. Impact escalated: releases frozen ~3 weeks (release/api Jul 29 vs main Aug 20), changesets unversioned, Security/CodeQL not running"
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
          "evidence": "Topology unchanged; the stoppage persists: all workflows on the #292 merge failed to start in ~4-5s (runs 32470963xxx, 2026-08-21T10:04Z)",
          "calibration": "Per 2026-07-28 note: scores topology design, not the CI stoppage."
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
          "evidence": "Mechanism intact; release/api frozen at Jul 29 vs main Aug 21, six pending changesets — downstream impact scored per calibration"
        },
        "7": {
          "score": 7,
          "evidence": "Gitleaks/CodeQL SHA-pinned unchanged; Security+CodeQL dark (stoppage); audit debt unchanged at 19 high"
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
          "slug": "github-actions-jobs-not-starting",
          "title": "ci: GitHub Actions jobs fail to start (cause outside the codebase)",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "observed",
          "reason": "Third consecutive run observing the stoppage; cause outside the codebase"
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
          "evidence": "Topology unchanged; stoppage cleared ~2026-09-01 (CodeQL 34126323459 green, Deep Checks executes); last green PR wall-clock ~4 min (30267187333: Check Fast 52s, Coverage 2m09s, e2e shards ~1m40s); mobile export gate runs twice weekly only; branch protection/required checks not enforced on this repository",
          "calibration": "Per 2026-07-28 note: scores topology design. Stoppage resolved; the mobile export red is an export-contract defect scored under dim 1."
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
          "evidence": "Mechanism intact (release.yml gates, digest-pinned Dockerfiles, changesets config); release/api 04df1c8 and release/web d05bc9a frozen at 07-29 vs main 08-27, 6 changesets pending; stoppage cleared but no push since — next merge or workflow_dispatch exercises the path"
        },
        "7": {
          "score": 7,
          "evidence": "CodeQL green (upload disabled on this repository), Gitleaks green, Trivy CRITICAL gate + SBOM in ci-pr; org scope from session at every resolver (~35 requireOrganizationScope sites), CORS fail-closed, secret entropy; audit gate red 25 high, 22 high Dependabot alerts open; SHA/digest pins have no refresh mechanism; introspection/complexity gates lack behavior tests"
        },
        "8": {
          "score": 7,
          "evidence": "Documented pnpm doctor (README.md:115, docs/troubleshooting.md:5) runs pnpm's built-in, never scripts/doctor.mjs (#307); pnpm check red locally after a desktop build (boundaries reads src-tauri/target); bootstrap/quick-setup/husky/.vscode intact, create-package honest, every other documented command exists and accepts its flags"
        },
        "9": {
          "score": 8,
          "evidence": "ai:doctor zero drift across 5 installs; 15 skills valid; 9 ADRs; REVIEW 9 headings; serena memories verified accurate against scripts/.nvmrc/workspace; stale claims MONOREPO_GUIDE.md:57 + kaine-triage-deps.md:9-43 (Renovate) and CONTRIBUTING.md:142 (required checks) fold into #306; strict drift gate not yet proven in CI since the stoppage"
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
          "slug": "github-actions-jobs-not-starting",
          "title": "ci: GitHub Actions jobs fail to start (cause outside the codebase)",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "fixed",
          "reason": "Jobs execute since ~2026-09-01 (CodeQL 34126323459 green 09-07); the stoppage cleared. Release still unexercised: no push to main since 08-27"
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
          "reason": "Mechanism intact; resolves on the next push to main or a Release workflow_dispatch now that the stoppage is cleared"
        },
        {
          "slug": "required-status-checks-not-enforced",
          "title": "ci: no required status checks — the ruleset is not imported on this repository",
          "dimension": 3,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Rulesets API returns 403 on this repository; the merge_group trigger in ci-pr.yml is inert until the ruleset is imported"
        },
        {
          "slug": "code-scanning-uploads-disabled",
          "title": "security: code scanning not enabled, so CodeQL and Trivy results never reach the Security tab",
          "dimension": 7,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Uploads disabled on this repository; workflows already gate on visibility/ENABLE_GITHUB_CODE_SCANNING"
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
    },
    {
      "date": "2026-09-09",
      "commit": "c4189a5c2e449ab895272b66bd5dde2663375751",
      "mode": "sequential",
      "agent": "claude",
      "overall": 7.4,
      "dimensions": {
        "1": {
          "score": 8,
          "evidence": "Server-only gate (SERVER_ONLY_ENTRY_PATTERN) in both client ESLint blocks with a contract test (#313); hooks on @repo/storage/client; knip green; boundaries green in CI (local red on gitignored src-tauri/target); no deep imports in apps/** or packages/**. Known gap: @repo/logger stays importable from mobile by design (pino browser build; PR-time expo export is the guard)"
        },
        "2": {
          "score": 8,
          "evidence": "typecheck has dependsOn ^typecheck and the shared tsconfig presets as inputs (#314): @repo/web#typecheck dry-run shows 9 dependencies and 5 preset inputs; lint/format:check inputs cover packages/config; contract test pins all three; global hash still pnpm-workspace.yaml + tsconfig.base.json. Open: the test task has no inputs for the doc-contract reads in packages/config (CI's coverage job runs vitest directly, uncached)"
        },
        "3": {
          "score": 7,
          "evidence": "Topology improved: Mobile Export Validation on PRs behind a widened mobile filter, action pins refreshed by Dependabot (#322), PR wall-clock 4m45s (run for #316: Check Fast 55s, Coverage 2m37s, e2e shards ~1m50s). But #318 (Docker Image api/web failed) and #320 (Coverage Threshold failed) were merged, so Release and Security are red on main; branch protection/required checks return 403 on this repository (#325)",
          "calibration": "Held at 7 with an explicit raise condition: required checks (import the ruleset) or a merge queue in use. Topology design is 8-capable; the outcome today shows the missing gate."
        },
        "4": {
          "score": 7,
          "evidence": "Cross-organization isolation e2e landed (#316: null read, absent list, rejected mutation, empty page, positive control; todos only). Test gate red on main: the vitest 3.x lockstep guard (monorepo-alignment.test.ts:587-588) fails after #320 bumped vitest to 4.1.11 with companions on 3.2.6, so pnpm test and pnpm coverage cannot complete (1 of 546 tests failing; no coverage-summary written). Floors unchanged (50/55/70); no schema-level GraphQL test; web feature tests still source-string"
        },
        "5": {
          "score": 6,
          "evidence": "Dependabot proven across npm, github-actions, docker within 24h of #315 (PRs #318-#322; Dependabot alerts 22→7 high); catalogs intact. Audit red again: pnpm audit --audit-level high exit 1 with 9 high (@xmldom/xmldom 0.8.14 ×6, js-yaml 4.3.1) published after #312; Dependabot reports security_update_not_possible for transitive deps so floors move by hand (#258 reopened). Policy gaps in the new config: no Node-major ignore for docker (#323), no vitest group (#324); 10 August bot PRs + #321 still open"
        },
        "6": {
          "score": 8,
          "evidence": "Release path proven end to end on 2026-09-08: release/api and release/web advanced to 369f4d6, version PRs #311 and #317 generated and merged. Blocked now: Release runs on 52ca788 and c4189a5 fail at check:ci (vitest guard); the run on 5bc1c4b that would have published tags was cancelled by later merges, so tags for 1.6.2/1.6.3 wait for a green run. Docker images unbuildable on node:26-slim (#323)"
        },
        "7": {
          "score": 7,
          "evidence": "CodeQL and Gitleaks green; tenancy proven at runtime by the isolation e2e; every resolver still scopes from session (60 organizationId hits, none from client input); supply-chain pins now refreshed by Dependabot; audit gate red (9 transitive highs); introspection/complexity/confirm content-type gates still lack behavior tests; code scanning uploads disabled"
        },
        "8": {
          "score": 8,
          "evidence": "pnpm preflight runs scripts/doctor.mjs and a contract test rejects built-in collisions (#307); every documented pnpm command exists and accepts its flags; bootstrap/quick-setup/husky intact. Open: local pnpm boundaries red on gitignored Tauri output; .vscode/launch.json vitest config proven broken (no root vitest config, per-workspace aliases not loaded)"
        },
        "9": {
          "score": 8,
          "evidence": "ai:doctor --strict zero drift and proven on every PR since the stoppage cleared; Renovate/required-checks claims corrected (#315); serena memories verified against scripts, .nvmrc, workspace; 15 skills, 9 ADRs, REVIEW 9 headings. Open: Dockerfile.*:3 still say Renovate bumps digests; MONOREPO_GUIDE.md lists Vite 7, Expo SDK 54, react@19.1.0 against vite 8 / SDK 55 / react 19.2 pins; dashboard.json Teams/squads drift"
        }
      },
      "findings": [
        {
          "slug": "dependabot-node-major-breaks-docker-images",
          "title": "deploy: node:26-slim base images fail to build and diverge from the Node 22 toolchain",
          "dimension": 6,
          "ladderRank": 1,
          "disposition": "open",
          "issue": 323
        },
        {
          "slug": "vitest-major-bump-breaks-catalog-lockstep",
          "title": "testing: vitest 4 catalog bump leaves coverage and ui companions on 3.2.6 and fails the lockstep guard",
          "dimension": 4,
          "ladderRank": 1,
          "disposition": "open",
          "issue": 324
        },
        {
          "slug": "red-prs-merged-without-required-checks",
          "title": "process: pull requests with failing checks reach main because required checks are not enforced",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "open",
          "issue": 325,
          "reason": "ready-for-human: no agent code fix; import the ruleset"
        },
        {
          "slug": "pnpm-audit-high-debt",
          "title": "security: pnpm audit reports high-severity advisories (Security workflow gate)",
          "dimension": 5,
          "ladderRank": 3,
          "disposition": "regression",
          "issue": 258,
          "reason": "Fixed by #312 on 09-08, red again on 09-09 with 9 transitive highs (@xmldom/xmldom, js-yaml) that Dependabot cannot patch; #258 reopened rather than a duplicate"
        },
        {
          "slug": "mobile-export-storage-node-only-barrel",
          "title": "storage: @repo/storage barrel pulls @aws-sdk/client-s3 into the Expo bundle and breaks expo export",
          "dimension": 1,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 305
        },
        {
          "slug": "turbo-typecheck-hash-omits-cross-package-inputs",
          "title": "build: turbo typecheck and lint hashes omit cross-package source and shared config, so affected runs hit stale cache",
          "dimension": 2,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 308
        },
        {
          "slug": "doctor-script-shadowed-by-pnpm-builtin",
          "title": "dx: documented pnpm doctor runs pnpm's built-in doctor, never scripts/doctor.mjs",
          "dimension": 8,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 307
        },
        {
          "slug": "renovate-inert-digest-refresh-absent",
          "title": "deps: renovate.json is inert and dependabot.yml covers only npm, so action SHAs and image digests never refresh",
          "dimension": 5,
          "ladderRank": 2,
          "disposition": "fixed",
          "issue": 306
        },
        {
          "slug": "no-cross-organization-isolation-test",
          "title": "testing: no test asserts cross-organization isolation end to end",
          "dimension": 4,
          "ladderRank": 4,
          "disposition": "fixed",
          "issue": 309,
          "reason": "Todos covered end to end; notes and attachments still have no cross-organization assertion (observed)"
        },
        {
          "slug": "release-branches-frozen-since-jul-29",
          "title": "release: release/api and release/web frozen at 2026-07-29 while main is at 2026-08-27",
          "dimension": 6,
          "ladderRank": 4,
          "disposition": "fixed",
          "reason": "Both branches advanced to 369f4d6 on 2026-09-08 by the Release workflow"
        },
        {
          "slug": "github-actions-jobs-not-starting",
          "title": "ci: GitHub Actions jobs fail to start (cause outside the codebase)",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "fixed",
          "reason": "Unchanged since 09-08; every workflow executes"
        },
        {
          "slug": "release-tags-pending-green-main",
          "title": "release: tags and GitHub releases for 1.6.2/1.6.3 not yet published",
          "dimension": 6,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "The Release run on 5bc1c4b (no pending changesets) was cancelled by later merges; subsequent runs fail at check:ci. Publishes on the next green Release run — no mechanism defect"
        },
        {
          "slug": "dependabot-security-updates-transitive-not-possible",
          "title": "deps: Dependabot security updates for transitive pnpm dependencies end security_update_not_possible",
          "dimension": 5,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Three failed security-update jobs on 09-09 (@xmldom/xmldom, js-yaml, @vitest/mocker); transitive advisories need the pnpm-workspace.yaml floor pattern — folded into #258"
        },
        {
          "slug": "dependabot-prs-stale-untriaged",
          "title": "deps: 10 Dependabot PRs open since 2026-08-24 plus #321",
          "dimension": 5,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "Workflow task — run kaine-triage-deps; #300 is superseded by the better-auth group PR #321"
        },
        {
          "slug": "test-task-inputs-omit-doc-contracts",
          "title": "build: turbo test task has no inputs for MONOREPO_GUIDE.md and DESIGN_SYSTEM.md read by packages/config tests",
          "dimension": 2,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Local pnpm test can hit a stale cache after a doc edit; CI's coverage job runs vitest directly and path-filters both docs — bounded"
        },
        {
          "slug": "launch-json-vitest-config-broken",
          "title": "dx: .vscode/launch.json vitest debug config runs from the root without a vitest config",
          "dimension": 8,
          "ladderRank": 10,
          "disposition": "observed",
          "reason": "Proven: mobile-ui tests fail to parse and scripts/*.test.mjs are node:test; lower ladder tier"
        },
        {
          "slug": "docs-version-facts-stale",
          "title": "docs: MONOREPO_GUIDE.md and Dockerfile comments carry stale version and bot facts",
          "dimension": 9,
          "ladderRank": 10,
          "disposition": "observed",
          "reason": "MONOREPO_GUIDE.md:57,78,79 (react@19.1.0, Vite 7, Expo SDK 54) and Dockerfile.*:3 (Renovate); the Dockerfile comment is fixed with #323"
        },
        {
          "slug": "hardening-gates-untested",
          "title": "security: introspection-off, depth/complexity, and confirm-time content-type gates have no behavior test",
          "dimension": 7,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Unchanged; gates exist, no test sends __schema, an over-limit query, or a mismatched content type"
        },
        {
          "slug": "web-tests-source-string-assertions",
          "title": "testing: web feature tests assert on source text, no rendered component tests",
          "dimension": 4,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Unchanged: 6 of 11 web tests read source text, 0 render"
        },
        {
          "slug": "required-status-checks-not-enforced",
          "title": "ci: no required status checks — the ruleset is not imported on this repository",
          "dimension": 3,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Not enforced; consequence materialized on 09-09 (#325)"
        },
        {
          "slug": "code-scanning-uploads-disabled",
          "title": "security: code scanning not enabled, so CodeQL and Trivy results never reach the Security tab",
          "dimension": 7,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Not enabled on this repository"
        },
        {
          "slug": "boundaries-local-red-tauri-target",
          "title": "tooling: turbo boundaries fails locally on gitignored apps/desktop/src-tauri/target output",
          "dimension": 8,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Unchanged; workaround pnpm --filter @repo/desktop clean"
        },
        {
          "slug": "coverage-evidence-stale",
          "title": "testing: coverage cannot be measured on main",
          "dimension": 4,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "Local pnpm coverage on c4189a5 stops at the vitest guard; resolves with #324"
        },
        {
          "slug": "translation-team-language-drift",
          "title": "i18n: dashboard.json uses Teams/squads/timove where CONTEXT mandates Organization",
          "dimension": 9,
          "ladderRank": 11,
          "disposition": "observed",
          "reason": "Unchanged; trivial fix, lowest ladder tier"
        }
      ]
    },
    {
      "date": "2026-09-09",
      "commit": "7e867a9c1516029db0dbb99372a3a612949220f2",
      "mode": "fan-out",
      "agent": "claude",
      "overall": 7.7,
      "dimensions": {
        "1": {
          "score": 8,
          "evidence": "Server-only regex (packages/config/eslint/base.js:14-15) blocks @repo/storage root, @repo/auth server entries, all of @repo/db and @repo/email in both client blocks (base.js:77,105) with a contract test (monorepo-alignment.test.ts:679-712); 0 deep @repo/*/src|dist imports; all 14 packages declare exports, no wildcards; knip exit 0; Mobile Export green on PR CI (34330942328). Observed: knip.json:76-78 ignores two undeclared deps (expo-updates, expo-system-ui) and unused zod in packages/auth (package.json:81, 0 imports) while --no-config-hints hides the drift; @repo/logger reachable from mobile by design; one @boundaries-ignore (packages/config/mobile-lan-dev.test.ts:3)"
        },
        "2": {
          "score": 8,
          "evidence": "^typecheck edge and preset inputs hold (@repo/web#typecheck dry-run: 9 dependencies, 93 inputs); global hash exactly pnpm-workspace.yaml + tsconfig.base.json; lint/format:check inputs cover packages/config. Reproduced gap: @repo/config#test hashes 23 inputs, none of the root files its contract tests read (MONOREPO_GUIDE.md, DESIGN_SYSTEM.md, .github/rulesets/main.json, ci-pr.yml, Dockerfile.*; monorepo-alignment.test.ts:176,186,344,393-394), and Release check:ci runs turbo test against the restored shared cache (ci-pr.yml:171-176,225; release.yml cache step); @repo/desktop#build depends only on @repo/config#build while its script builds @repo/web inline and writes src-tauri/target outside outputs (local turbo path only); turbo.json:71 alias comment stale"
        },
        "3": {
          "score": 7,
          "evidence": "Topology unchanged; every job has timeout-minutes and every workflow a concurrency group; ruleset file + job-name contract test landed (#342) but rulesets and branch protection still return 403 on this repository; three PRs merged red today (#341 run 34328147938, #342 34328298593, #345 34329133651) and Release failed on four consecutive main commits (bf15118, 399dbb8, 97bc907, 6ce8906); codeql.yml:3-12 has no merge_group trigger while .github/rulesets/main.json:43 requires Analyze TypeScript, so the shipped merge queue would time out (main.json:56); last green code PR 8m06s (34330942328) with Docker Image (api) 7m54s on the critical path: build-push-action never runs on main so the gha cache scope is cold on every new branch (CACHED=0 on 34318105496 vs 24 on re-push 34318778616) and SBOM alone takes 2m44s; docker filter omits .npmrc (Dockerfile.api:19); no desktop gate on PRs (Deep Checks Tue/Fri only, 5 of 5 recent runs red at 5f6f91f before #313)",
          "calibration": "Held at 7 per the 09-09 binding condition: required checks or a merge queue are still not in use (rulesets API 403). When the ruleset is applied, the CodeQL merge_group gap must be closed first or the queue stalls."
        },
        "4": {
          "score": 8,
          "evidence": "Test gate green on main (Release 34333983591 check:ci); vitest 4.1.11 trio with a major-agnostic lockstep test (monorepo-alignment.test.ts:620-628); every workspace vitest.config.ts spreads the @repo/config/vitest exclude preset, contract-tested (:632-660); floors re-baselined with headroom and proven by the Coverage Threshold gate (34330942328: 141 files, lines 49.91 / branches 42.31 / funcs 43.23 vs 45/38/40; auth 83.4/79.4 vs 80/75, api 62.0/56.9 vs 55/50, mobile-ui 57.5/38.7 vs 50/35 from coverage-summary.json today). Observed: no test executes a GraphQL operation through the schema (server.test.ts:35-58 posts no operation); cross-organization e2e covers todos only; 6 of 11 web tests read source text, 0 render; 2 invitation/attachment e2e tests skipped"
        },
        "5": {
          "score": 7,
          "evidence": "Binding conditions met: pnpm audit --audit-level high exit 0 (Security 34333983597 green) and #323/#324 closed. dependabot.yml covers npm (better-auth/vitest/non-major groups, major ignores for the deferred set), github-actions, docker; 0 open bot PRs; Dependabot alerts 0 high / 5 medium / 3 low; 74 catalog: + 22 catalog:mobile refs with zero duplicate literal ranges; pnpm outdated -r: 23 majors behind, all covered by ignores or #287 except @clack/prompts. Gaps: the npm updater job ends red every run (@types/node unknown_error, runs 34330308527 and 34321500749) while still opening PRs; pnpm-workspace.yaml:69 exact esbuild 0.27.3 override is itself the open advisory floor (fixed 0.28.1) and :68 tar matches nothing in the lock; the Cargo graph (glib 0.18.5 medium alert, Cargo.lock:1088) has no bot ecosystem or audit gate; docker-compose images tag-pinned outside Dependabot; eslint ^9.35.0 resolves to 9.39.2 and 9.39.5 (pnpm-lock.yaml:6118,6129)"
        },
        "6": {
          "score": 8,
          "evidence": "Release path proven again today: 34333983591 green on 7e867a9 (check:ci, build:core, test:e2e, release:apps advanced release/api and release/web to HEAD), version PRs #311/#317 wrote CHANGELOGs, tags + GitHub releases for 10 packages published on 55d098f, every workspace version has a matching tag, no pending changesets; Changesets CLI 3 + changesets/action v2.1.2 SHA-pinned with tag steps keyed on git tag --points-at HEAD (release.yml:118,133); app discovery derived from Dockerfile.<app> (release.util.ts:53-56,145-180); migrations copied and gated by API_RUN_MIGRATIONS (Dockerfile.api:52, startup.config.ts:27, docs/release-checklist.md:33-35). Gaps: Release ran red on four main commits today behind unrequired checks (dim 3) and a lockfile-less major (#345 then #346); the release:apps affected set (release.util.ts:7-14,211-214) and the docker PR filter ignore .npmrc and scripts/fix-esm-extensions.mjs that Dockerfile.api:19,26 copies; nothing tests the release path itself"
        },
        "7": {
          "score": 8,
          "evidence": "Audit gate green (pnpm audit --audit-level high exit 0; Security 34333983597 success) after caret floors + documented ignoreGhsas in pnpm-workspace.yaml; CodeQL and Gitleaks green; tenancy uniformly session-derived: 36 requireOrganizationScope router calls, every adapter filters scope.organizationId, no input carries organizationId, proven at runtime by web-organization-isolation.e2e.ts; introspection off in prod, depth/complexity limits, in-memory rate limit, CORS fail-closed (server.config.ts:53-121, server.ts:97-101), secret entropy guard (auth.config.ts:19-42); frozen lockfile in every CI install, prod image --ignore-scripts, digest-pinned bases, Trivy CRITICAL gate + SBOM; SECURITY.md present. Observed: introspection/depth/complexity and confirm content-type gates have unit tests only (server.config.test.ts:37-81; storage.lifecycle.ts:175-180 untested); docker-compose images tag-pinned outside Dependabot; cookie attributes and server password minimum rely on better-auth defaults; code scanning uploads disabled"
        },
        "8": {
          "score": 7,
          "evidence": "Every documented pnpm command exists and parses its flags; pnpm preflight honest (Node, pnpm, Docker, ports, .env, labels, coverage age); husky pre-commit/commit-msg/pre-push intact; Node 22 / pnpm 10.29.3 single-sourced. Reproduced: the documented first run (quick-setup > initialize > bootstrap > pnpm run build > turbo run build) includes @repo/desktop#build = tauri build --no-bundle, a full Rust compile that README.md:54 scopes to desktop work and scripts/doctor.mjs never checks for; the resulting src-tauri/target then fails pnpm boundaries and so pnpm check (local exit 1 today), the pre-PR gate named in CONTRIBUTING.md:164 and day-one.md:52 that docs/troubleshooting.md never mentions. scripts/create-package.mjs:151-219 writes no vitest.config.ts or tsconfig.build.json, so a new package fails the vitest-exclude contract test once tracked and its tsc build emits dist/*.test.js that vitest 4 then runs. .vscode/launch.json:26-31 vitest config still runs from the root with no config"
        },
        "9": {
          "score": 8,
          "evidence": "ai:doctor --strict exit 0 (zero drift, 15 skills valid, 5 installs, 6 MCP ok) and enforced on every PR (ci-pr.yml Check Fast); REVIEW.md equals .ai/review.md bar the generated header; serena memories resolve against current scripts, .nvmrc, workspace; 9 ADRs; all triage labels exist; Dockerfile Renovate comments fixed (#328). Observed: MONOREPO_GUIDE.md:56,57,78,79,84,326,327,349 state superseded versions or gate shapes (React 19.1, Vite 7, Expo SDK 54, better-auth 1.6, check without boundaries/knip, floors without mobile-ui, mobile export scheduled-only); ADR 0002 (SDK 54) and ADR 0003 (mobile export scheduled-only) contradict apps/mobile/package.json and ci-pr.yml:303-313; dashboard.json:4 Teams/squads/timove; turbo.json:71 stale"
        }
      },
      "findings": [
        {
          "slug": "bootstrap-builds-tauri-desktop",
          "title": "dx: pnpm bootstrap compiles the Tauri desktop app and leaves pnpm check red on every fresh clone",
          "dimension": 8,
          "ladderRank": 1,
          "disposition": "open",
          "reason": "Proposed; root build script runs @repo/desktop#build (tauri build --no-bundle) with no Rust preflight, and the target dir then fails turbo boundaries"
        },
        {
          "slug": "boundaries-local-red-tauri-target",
          "title": "tooling: turbo boundaries fails locally on gitignored apps/desktop/src-tauri/target output",
          "dimension": 8,
          "ladderRank": 1,
          "disposition": "open",
          "reason": "Upgraded from observed: bootstrap itself creates the directory, so every onboarded clone hits it; same issue as bootstrap-builds-tauri-desktop"
        },
        {
          "slug": "create-package-missing-vitest-config",
          "title": "tooling: create-package scaffolds a package that the vitest-exclude contract test rejects",
          "dimension": 8,
          "ladderRank": 1,
          "disposition": "open",
          "reason": "Proposed; scripts/create-package.mjs writes no vitest.config.ts or tsconfig.build.json (monorepo-alignment.test.ts:632-660)"
        },
        {
          "slug": "test-task-inputs-omit-doc-contracts",
          "title": "build: turbo test hash for packages/config omits the root files its contract tests read, so Release and local runs can hit a stale cache",
          "dimension": 2,
          "ladderRank": 1,
          "disposition": "open",
          "reason": "Broadened from the 09-09 observed entry: rulesets/main.json, ci-pr.yml, Dockerfile.* and both docs are read but unhashed (dry-run 23 inputs); proposed for filing"
        },
        {
          "slug": "codeql-missing-merge-group-trigger",
          "title": "ci: codeql.yml never runs on merge_group while the ruleset requires Analyze TypeScript",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "open",
          "reason": "Proposed; latent until the ruleset applies, then the merge queue times out after 60 minutes (main.json:43,56)"
        },
        {
          "slug": "deploy-inputs-invisible-to-affected-gates",
          "title": "release: files the api image copies are neither release:apps nor docker-filter inputs",
          "dimension": 6,
          "ladderRank": 1,
          "disposition": "open",
          "reason": "Proposed; .npmrc and scripts/fix-esm-extensions.mjs (Dockerfile.api:19,26) are dropped by release.util.ts:7-14,211-214 and absent from ci-pr.yml docker filter"
        },
        {
          "slug": "dependabot-npm-updater-red-types-node",
          "title": "deps: the Dependabot npm updater job ends in error on @types/node every run",
          "dimension": 5,
          "ladderRank": 1,
          "disposition": "open",
          "reason": "Proposed; runs 34330308527 and 34321500749 report @types/node unknown_error after opening PRs; a red job masks future errors; cause undetermined"
        },
        {
          "slug": "esbuild-override-pins-advisory-floor",
          "title": "deps: the exact esbuild override pins the version an open advisory names as vulnerable",
          "dimension": 5,
          "ladderRank": 2,
          "disposition": "open",
          "reason": "Proposed with cargo-deps-unaudited and compose pins as one supply-chain issue; pnpm-workspace.yaml:69 vs alert fixed=0.28.1; :68 tar override matches nothing"
        },
        {
          "slug": "cargo-deps-unaudited",
          "title": "deps: the Tauri Cargo graph has no bot ecosystem and no audit gate",
          "dimension": 5,
          "ladderRank": 2,
          "disposition": "open",
          "reason": "Proposed; dependabot.yml lacks a cargo ecosystem, no cargo audit in workflows, glib 0.18.5 medium alert open (Cargo.lock:1088)"
        },
        {
          "slug": "compose-images-tag-pinned-outside-dependabot",
          "title": "deps: docker-compose postgres and minio images are tag-pinned and not bot-managed",
          "dimension": 7,
          "ladderRank": 2,
          "disposition": "open",
          "reason": "Proposed as part of the supply-chain issue; docker-compose.yml:3,19,31; dependabot.yml:117"
        },
        {
          "slug": "hardening-gates-untested",
          "title": "security: introspection-off, depth/complexity, and confirm-time content-type gates have no request-level test",
          "dimension": 7,
          "ladderRank": 4,
          "disposition": "open",
          "reason": "Observed for three runs and #309 closed without it; proposed for filing (server.config.test.ts:37-81 unit only, storage.lifecycle.ts:175-180 untested)"
        },
        {
          "slug": "docker-cache-cold-on-every-new-branch",
          "title": "ci: the Docker layer cache is never seeded from main, so each branch's first build runs cold",
          "dimension": 3,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Below the filing bar (performance); the largest PR wall-clock lever (Docker api 7m54s of 8m06s; CACHED=0 vs 24 on re-push); ci-pr.yml never runs build-push-action on main"
        },
        {
          "slug": "desktop-build-hash-omits-web",
          "title": "build: apps/desktop build task hash excludes @repo/web sources and its tauri output is not a turbo output",
          "dimension": 2,
          "ladderRank": 1,
          "disposition": "observed",
          "reason": "Local turbo path only (no CI path runs turbo build for desktop); folds into bootstrap-builds-tauri-desktop, whose fix removes desktop from the root build"
        },
        {
          "slug": "red-prs-merged-without-required-checks",
          "title": "process: pull requests with failing checks reach main because required checks are not enforced",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "open",
          "issue": 325,
          "reason": "Recurred today: #341, #342, #345 merged with red PR CI; Release red on four main commits. Ruleset shipped (#342), still ready-for-human"
        },
        {
          "slug": "pnpm-audit-high-debt",
          "title": "security: pnpm audit reports high-severity advisories (Security workflow gate)",
          "dimension": 5,
          "ladderRank": 3,
          "disposition": "fixed",
          "issue": 258,
          "reason": "Caret floors + documented ignoreGhsas (#328); audit exit 0 on 7e867a9"
        },
        {
          "slug": "dependabot-node-major-breaks-docker-images",
          "title": "deploy: node:26-slim base images fail to build and diverge from the Node 22 toolchain",
          "dimension": 6,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 323
        },
        {
          "slug": "vitest-major-bump-breaks-catalog-lockstep",
          "title": "testing: vitest 4 catalog bump leaves coverage and ui companions on 3.2.6 and fails the lockstep guard",
          "dimension": 4,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 324
        },
        {
          "slug": "release-tags-pending-green-main",
          "title": "release: tags and GitHub releases for 1.6.2/1.6.3 not yet published",
          "dimension": 6,
          "ladderRank": 4,
          "disposition": "fixed",
          "reason": "Published by the Release run on 55d098f; every workspace version now has a tag"
        },
        {
          "slug": "dependabot-prs-stale-untriaged",
          "title": "deps: 10 Dependabot PRs open since 2026-08-24 plus #321",
          "dimension": 5,
          "ladderRank": 7,
          "disposition": "fixed",
          "reason": "Recreated as #336 and merged; 0 open PRs"
        },
        {
          "slug": "coverage-evidence-stale",
          "title": "testing: coverage cannot be measured on main",
          "dimension": 4,
          "ladderRank": 9,
          "disposition": "fixed",
          "reason": "Measured today locally and by the Coverage Threshold gate on 34330942328"
        },
        {
          "slug": "no-schema-level-graphql-test",
          "title": "testing: no test executes a GraphQL operation through the schema",
          "dimension": 4,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Depth gap, gate intact; server.test.ts:35-58 posts to /graphql without an operation, features.test.ts asserts the resolver map only"
        },
        {
          "slug": "e2e-cross-org-todos-only",
          "title": "testing: cross-organization isolation is asserted for todos only",
          "dimension": 4,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Noted at #309 closure; notes, attachments, organizations, invitations have no cross-organization assertion"
        },
        {
          "slug": "web-tests-source-string-assertions",
          "title": "testing: web feature tests assert on source text, no rendered component tests",
          "dimension": 4,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Unchanged: 6 of 11 web tests read source text, 0 render"
        },
        {
          "slug": "knip-ignore-stale-and-laundering",
          "title": "tooling: knip.json ignoreDependencies hides two undeclared deps and one unused dep",
          "dimension": 1,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "knip.json:76-78 (expo-updates, expo-system-ui undeclared; zod unused in packages/auth); --no-config-hints suppresses the hint; lower ladder tier"
        },
        {
          "slug": "eslint-duplicate-resolution",
          "title": "deps: eslint ^9.35.0 resolves to 9.39.2 and 9.39.5 in one lockfile",
          "dimension": 5,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "pnpm-lock.yaml:6118,6129; a pnpm dedupe pass, lower ladder tier"
        },
        {
          "slug": "dependabot-security-updates-transitive-not-possible",
          "title": "deps: Dependabot security updates for transitive pnpm dependencies end security_update_not_possible",
          "dimension": 5,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Mechanism gap unchanged; no high alerts open today, floors moved by hand in pnpm-workspace.yaml"
        },
        {
          "slug": "ci-scripts-test-list-comment-only",
          "title": "ci: the scripts test list in Check Fast duplicates the root test script with comment-only alignment",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "ci-pr.yml:218-219; lists match today; lower ladder tier"
        },
        {
          "slug": "deep-checks-red-until-next-schedule",
          "title": "ci: Deep Checks is red on its last five runs, all at 5f6f91f before the mobile export fix",
          "dimension": 3,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "Cause fixed by #313; the PR-time Mobile Export gate is green; next scheduled run Friday proves it"
        },
        {
          "slug": "launch-json-vitest-config-broken",
          "title": "dx: .vscode/launch.json vitest debug config runs from the root without a vitest config",
          "dimension": 8,
          "ladderRank": 10,
          "disposition": "observed",
          "reason": "Unchanged after #341: launch.json:26-31 cwd is the root, which has no vitest.config.*"
        },
        {
          "slug": "docs-version-facts-stale",
          "title": "docs: MONOREPO_GUIDE.md and ADRs 0002/0003 carry superseded version and gate facts",
          "dimension": 9,
          "ladderRank": 10,
          "disposition": "observed",
          "reason": "Recurring third run; MONOREPO_GUIDE.md:56,57,78,79,84,326,327,349 and docs/adr/0002,0003; a one-PR docs chore, below the filing bar"
        },
        {
          "slug": "translation-team-language-drift",
          "title": "i18n: dashboard.json uses Teams/squads/timove where CONTEXT mandates Organization",
          "dimension": 9,
          "ladderRank": 11,
          "disposition": "observed",
          "reason": "Unchanged; trivial fix, lowest ladder tier"
        },
        {
          "slug": "required-status-checks-not-enforced",
          "title": "ci: no required status checks, the ruleset is not imported on this repository",
          "dimension": 3,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Rulesets API 403 today; .github/rulesets/main.json ready to import"
        },
        {
          "slug": "code-scanning-uploads-disabled",
          "title": "security: code scanning not enabled, so CodeQL and Trivy results never reach the Security tab",
          "dimension": 7,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Not enabled on this repository"
        }
      ]
    },
    {
      "date": "2026-09-10",
      "commit": "cd623ee7e122b94f3f2df87a0742ef9a3561a5a6",
      "mode": "fan-out",
      "agent": "claude",
      "overall": 7.8,
      "dimensions": {
        "1": {
          "score": 8,
          "evidence": "Server-only regex defined at packages/config/eslint/base.js:14-15 and applied in both client blocks (:95, :121), contract-tested at monorepo-alignment.test.ts:707-741; 0 deep @repo/*/src|dist imports and every @repo/x/y subpath in use maps to a declared exports key; all 13 packages declare exports; knip exit 0; pnpm boundaries green (1137 files, 19 packages) once the pre-#365 Tauri target dir was removed; Mobile Export green on PR CI. Observed unchanged: knip.json:76-78 ignores two undeclared deps and unused zod (packages/auth/package.json:81); @repo/logger reachable from mobile by design; one @boundaries-ignore"
        },
        "2": {
          "score": 8,
          "evidence": "#366 closed the test-hash gap: @repo/config#test dry-run has 561 inputs including .github/rulesets/main.json, all 7 workflow ymls, Dockerfile.api/web, MONOREPO_GUIDE.md, DESIGN_SYSTEM.md, .gitignore, root package.json and turbo.json; every root path read by packages/config/*.test.ts is hashed (0 missing); @repo/ui#test hashes DESIGN_SYSTEM.md; lists pinned at monorepo-alignment.test.ts:856-891; global hash exactly pnpm-workspace.yaml + tsconfig.base.json; .tauri-target and .claude/worktrees/ gitignored and outside every hash. Observed: @repo/desktop#build still depends only on @repo/config#build while its script builds @repo/web inline (bounded by cache:false and the bootstrap filter); no automated check that files a test reads appear in turbo inputs (the pinned list is hand-maintained)"
        },
        "3": {
          "score": 7,
          "evidence": "Held by the binding condition: rulesets/branch protection still 403 on this repository, #325 open. Topology improved: docker-cache.yml (push to main, path list equal to ci-pr's docker filter, identical SHA pins) seeded green on 003c064 and cd623ee; PR 34401778755 wall clock 5m57s (was 8m06s) with Docker Image (api) 5m43s and 16 CACHED layers, now dominated by image load + two Trivy passes + SBOM (~3m40s) after a 30s compile; codeql.yml:9 runs on merge_group and monorepo-alignment.test.ts:210-230 asserts it for every required check; deep-checks.yml:85-89 caches the moved .tauri-target. Observed: docker-cache path list equals ci-pr's by comment only; Deep Checks last ran 2026-09-08 at 5f6f91f (pre-fix red), next scheduled Fri",
          "calibration": "Held at 7 per the 09-09 binding condition (required checks or a merge queue in use). The latent CodeQL merge_group gap is closed, so importing .github/rulesets/main.json is the only remaining step."
        },
        "4": {
          "score": 8,
          "evidence": "Coverage Threshold green on PR 34401778755: 142 test files, lines 50.15 / statements 49.49 / functions 43.42 / branches 42.67 vs floors 45/45/40/38; 152 test files on disk; apps/api/src/server.hardening.test.ts drives the real Yoga handler on an ephemeral port and asserts 400 + message for introspection, depth, and complexity with positive controls (:93-171), reading limits from resolveApiRuntimeConfig (:131,:153); storage content-type mismatch covered at storage.lifecycle.test.ts:130-158; scripts/create-package.test.mjs registered in root test (package.json:27) and Check Fast (ci-pr.yml:220). Observed: no test runs a session-scoped feature operation through the schema (todos.router.test.ts:19 calls resolvers directly); cross-organization e2e covers todos only; 6 of 11 web tests read source text, 0 render; invitation/attachment e2e still test.skip"
        },
        "5": {
          "score": 7,
          "evidence": "Binding raise condition unmet: the npm updater job is still red (34387229249) under a new mechanism: with minimumReleaseAge 4320 (pnpm-workspace.yaml:70) Dependabot's second step pnpm install --lockfile-only rejects obug@2.2.1 (12h old, locked since bf15118) because vitest/@vitest/coverage-v8 snapshot keys include the @types/node peer, so an @types/node bump re-resolves that subtree; #356 relabelled ready-for-human (pnpm 11 vs Dependabot-only cooldown). Otherwise strong: five ecosystems (dependabot.yml:10,100,121,140,161) with groups and major ignores, cargo/docker-compose/docker/github-actions jobs green on first run; every override a caret floor (pnpm-workspace.yaml:77-108), tar override gone, esbuild ^0.28.1; audit exit 0; alerts 0 high / 5 medium / 2 low; 0 open bot PRs; 28 majors behind, all covered by ignores or #287 except @clack/prompts and the deliberate mobile tailwindcss 3 line"
        },
        "6": {
          "score": 8,
          "evidence": "Release green on cd623ee (34441002649): release/api and release/web advanced to cd623ee and the changesets action opened version PR #372 (@repo/translation 1.3.2, @repo/web 1.6.2 plus dependents); tags for 10 packages published 2026-09-09; .ai/release.util.ts:7-8,17-18 now count .npmrc and scripts/fix-esm-extensions.mjs as image inputs with spec cases (release.util.spec.ts:118,124); Dockerfiles unchanged and digest-pinned. Observed: the git path of .ai/release-apps.ts (fetch, merge-base, update-ref, push) has no test; version-PR CI runs stop at action_required until a maintainer approves them (runs 34441235642/34441235725; #317 needed a human re-run); tags publish only on the last green commit of a merge burst"
        },
        "7": {
          "score": 8,
          "evidence": "Audit exit 0 (Security 34441002645 green), CodeQL green, Gitleaks green; request-level hardening tests landed (#368: server.hardening.test.ts:93-171; content-type at the service layer storage.lifecycle.test.ts:130-158); tenancy: 36 requireOrganizationScope router calls, adapters filter scope.organizationId, runtime-proven by the isolation e2e; minimumReleaseAge gate for human installs; frozen lockfile in every CI install; digest-pinned bases with Trivy CRITICAL gate + SBOM; compose images now under the docker-compose ecosystem (dependabot.yml:161) though still tag-pinned (docker-compose.yml:3,19,31); SECURITY.md. Observed: cookie attributes and server password minimum rely on better-auth defaults (auth.instance.ts:174-176 sets only cookiePrefix; client-side min 8 only); no sweeping contract test or lint that every resolver resolves scope from session; scanners cannot block merges without required checks"
        },
        "8": {
          "score": 8,
          "evidence": "Raise condition met: bootstrap runs turbo run build --filter=!@repo/desktop (package.json:43), pinned by monorepo-alignment.test.ts:171,181-182; scripts/doctor.mjs:141-167 warns on a missing Rust toolchain and fails only with --with-desktop; the Cargo target moved to root .tauri-target (apps/desktop/src-tauri/.cargo/config.toml:7; .gitignore:20; deep-checks.yml:88) with a troubleshooting entry (docs/troubleshooting.md:102-117); create-package writes vitest.config.ts, tsconfig.build.json, .prettierignore (scripts/create-package.mjs:252-254) with scripts/create-package.test.mjs in root test and Check Fast; .ai/install.ts:243-244 accepts the pnpm run separator (install.spec.ts:14-17). Fresh-clone smoke at 4e6a8e1 with Rust off PATH: pnpm bootstrap exit 0 in 29s, pnpm check exit 0 in 49s; 36 documented pnpm commands all resolve; preflight honest (exit 1 only on the local placeholder secret); .claude/worktrees/ gitignored; type:perf label created. Observed: .vscode/launch.json:29-30 vitest debug still runs from the root without a vitest config"
        },
        "9": {
          "score": 8,
          "evidence": "ai:doctor --strict exit 0 and gating every PR; MONOREPO_GUIDE.md:56-57,78,79,84 now match pnpm-workspace.yaml, apps/web and apps/mobile manifests (React 19.2, Vite 8, Expo SDK 55, better-auth 1.7), check/coverage/mobile-export rows corrected (#371); ADR 0002:27 and 0003:32 carry dated status updates; dashboard.json en/de/sr use Organization wording; REVIEW.md equals .ai/review.md bar the generated header; serena environment_setup.md matches .nvmrc and packageManager; README:79, CONTRIBUTING.md:142-148, day-one.md correct. Observed: hand-written facts are verified by hand, not by a manifest-derived test (monorepo-alignment.test.ts:420-467 pins only theme/SDL/styling/flags/catalog:mobile strings); serena task_completion_checklist.md:14 omits boundaries and knip and suggested_commands.md omits pnpm preflight; kaine-adopt-template.md:37 keeps a dead src-tauri/target glob"
        }
      },
      "findings": [
        {
          "slug": "bootstrap-builds-tauri-desktop",
          "title": "dx: pnpm bootstrap compiles the Tauri desktop app and leaves pnpm check red on every fresh clone",
          "dimension": 8,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 351,
          "reason": "#365; fresh-clone smoke test exit 0 without Rust"
        },
        {
          "slug": "boundaries-local-red-tauri-target",
          "title": "tooling: turbo boundaries fails locally on gitignored apps/desktop/src-tauri/target output",
          "dimension": 8,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 351,
          "reason": "Cargo target moved to root .tauri-target; boundaries green locally after removing the old dir"
        },
        {
          "slug": "bootstrap-ai-install-separator-rejected",
          "title": "dx: pnpm bootstrap fails at ai:install because the -- separator reaches the installer",
          "dimension": 8,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 367,
          "reason": "Found during #351; #370 skips a bare -- with a spawned spec; smoke test passes the step"
        },
        {
          "slug": "create-package-missing-vitest-config",
          "title": "tooling: create-package scaffolds a package that the vitest-exclude contract test rejects",
          "dimension": 8,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 352
        },
        {
          "slug": "test-task-inputs-omit-doc-contracts",
          "title": "build: turbo test hash for packages/config omits the root files its contract tests read",
          "dimension": 2,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 353,
          "reason": "#366; dry-run shows every root read hashed and a contract test pins the lists"
        },
        {
          "slug": "codeql-missing-merge-group-trigger",
          "title": "ci: codeql.yml never runs on merge_group while the ruleset requires Analyze TypeScript",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 354
        },
        {
          "slug": "deploy-inputs-invisible-to-affected-gates",
          "title": "release: files the api image copies are neither release:apps nor docker-filter inputs",
          "dimension": 6,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 355
        },
        {
          "slug": "dependabot-npm-updater-red-types-node",
          "title": "deps: the Dependabot npm updater job ends in error on @types/node every run",
          "dimension": 5,
          "ladderRank": 1,
          "disposition": "open",
          "issue": 356,
          "reason": "#369 moved the failure, not removed it: the repo gate now rejects a 12h-old locked transitive when an @types/node bump re-resolves the vitest subtree; ready-for-human (pnpm 11 or Dependabot-only cooldown)"
        },
        {
          "slug": "esbuild-override-pins-advisory-floor",
          "title": "deps: the exact esbuild override pins the version an open advisory names as vulnerable",
          "dimension": 5,
          "ladderRank": 2,
          "disposition": "fixed",
          "issue": 357
        },
        {
          "slug": "cargo-deps-unaudited",
          "title": "deps: the Tauri Cargo graph has no bot ecosystem and no audit gate",
          "dimension": 5,
          "ladderRank": 2,
          "disposition": "fixed",
          "issue": 357,
          "reason": "cargo ecosystem added; first job green. No cargo audit gate yet (observed)"
        },
        {
          "slug": "compose-images-tag-pinned-outside-dependabot",
          "title": "deps: docker-compose postgres and minio images are tag-pinned and not bot-managed",
          "dimension": 7,
          "ladderRank": 2,
          "disposition": "fixed",
          "issue": 357,
          "reason": "docker-compose ecosystem added; images remain tag-pinned by design"
        },
        {
          "slug": "hardening-gates-untested",
          "title": "security: introspection-off, depth/complexity, and confirm-time content-type gates have no request-level test",
          "dimension": 7,
          "ladderRank": 4,
          "disposition": "fixed",
          "issue": 358
        },
        {
          "slug": "docker-cache-cold-on-every-new-branch",
          "title": "ci: the Docker layer cache is never seeded from main, so each branch's first build runs cold",
          "dimension": 3,
          "ladderRank": 6,
          "disposition": "fixed",
          "issue": 359,
          "reason": "docker-cache.yml seeded on 003c064; PR 34401778755 api job CACHED=16, wall clock 5m57s"
        },
        {
          "slug": "docs-version-facts-stale",
          "title": "docs: MONOREPO_GUIDE.md and ADRs 0002/0003 carry superseded version and gate facts",
          "dimension": 9,
          "ladderRank": 10,
          "disposition": "fixed",
          "reason": "#371 refreshed the guide, added dated ADR status updates, corrected the release checklist"
        },
        {
          "slug": "translation-team-language-drift",
          "title": "i18n: dashboard.json uses Teams/squads/timove where CONTEXT mandates Organization",
          "dimension": 9,
          "ladderRank": 11,
          "disposition": "fixed",
          "reason": "#371 with a @repo/translation patch changeset"
        },
        {
          "slug": "red-prs-merged-without-required-checks",
          "title": "process: pull requests with failing checks reach main because required checks are not enforced",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "open",
          "issue": 325,
          "reason": "Ruleset file and merge_group triggers ready; import the ruleset"
        },
        {
          "slug": "desktop-build-hash-omits-web",
          "title": "build: apps/desktop build task hash excludes @repo/web sources and its tauri output is not a turbo output",
          "dimension": 2,
          "ladderRank": 1,
          "disposition": "observed",
          "reason": "Bounded: apps/desktop/turbo.json cache:false and bootstrap excludes desktop; no CI path runs turbo build for desktop"
        },
        {
          "slug": "test-input-coverage-not-gated",
          "title": "build: no automated check that files a test reads appear in its turbo inputs",
          "dimension": 2,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "The pinned lists at monorepo-alignment.test.ts:856-891 are hand-maintained; deriving them from test sources was judged over-engineering in #366"
        },
        {
          "slug": "no-schema-level-graphql-test",
          "title": "testing: no test runs a session-scoped feature operation through the schema",
          "dimension": 4,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Narrowed by #368 (health and __schema now go through Yoga); feature routers are tested by direct resolver calls (todos.router.test.ts:19)"
        },
        {
          "slug": "e2e-cross-org-todos-only",
          "title": "testing: cross-organization isolation is asserted for todos only",
          "dimension": 4,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Unchanged (web-organization-isolation.e2e.ts:54); invitation/attachment specs still test.skip"
        },
        {
          "slug": "web-tests-source-string-assertions",
          "title": "testing: web feature tests assert on source text, no rendered component tests",
          "dimension": 4,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Unchanged: 6 of 11 read source text, 0 render"
        },
        {
          "slug": "tenancy-enforced-by-convention",
          "title": "security: no contract test or lint guarantees every resolver resolves scope from session",
          "dimension": 7,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "36 router calls plus per-feature tests and the isolation e2e; a sweeping gate is what band 9 needs"
        },
        {
          "slug": "auth-cookie-password-policy-implicit",
          "title": "security: cookie attributes and server password minimum rely on better-auth defaults",
          "dimension": 7,
          "ladderRank": 2,
          "disposition": "observed",
          "reason": "auth.instance.ts:174-176 sets only cookiePrefix; defaults are secure but undeclared and untested; below the filing bar without a reproduced weakness"
        },
        {
          "slug": "version-pr-ci-held-action-required",
          "title": "release: changesets version PR CI runs stop at action_required until a maintainer approves them",
          "dimension": 6,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Runs 34441235642/34441235725 on changeset-release/main; repository Actions approval setting, not code"
        },
        {
          "slug": "docker-image-job-dominated-by-scan-export",
          "title": "ci: the api image job spends about 3m40s on image load, two Trivy passes, and SBOM after a 30s compile",
          "dimension": 3,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Next speed lever after the cache seed; ci-pr.yml:456,463-495"
        },
        {
          "slug": "docker-cache-path-list-comment-only",
          "title": "ci: docker-cache.yml path list and pins match ci-pr.yml by comment only",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Equal today (12 entries, same pins); a contract test would pin it"
        },
        {
          "slug": "majors-uncovered-by-ignore-or-287",
          "title": "deps: @clack/prompts and the mobile tailwindcss major sit outside ignores and #287",
          "dimension": 5,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Mobile tailwind 3 is the deliberate NativeWind line; @clack/prompts 0.11 to 1.x is a small intentional bump"
        },
        {
          "slug": "serena-memories-minor-drift",
          "title": "docs: serena task_completion_checklist omits boundaries/knip and suggested_commands omits pnpm preflight",
          "dimension": 9,
          "ladderRank": 10,
          "disposition": "observed",
          "reason": ".ai/serena-memories; trivial, batch into the next docs PR with kaine-adopt-template.md:37 dead target glob"
        },
        {
          "slug": "launch-json-vitest-config-broken",
          "title": "dx: .vscode/launch.json vitest debug config runs from the root without a vitest config",
          "dimension": 8,
          "ladderRank": 10,
          "disposition": "observed",
          "reason": "Unchanged (.vscode/launch.json:29-30)"
        },
        {
          "slug": "knip-ignore-stale-and-laundering",
          "title": "tooling: knip.json ignoreDependencies hides two undeclared deps and one unused dep",
          "dimension": 1,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Unchanged (knip.json:76-78; packages/auth/package.json:81)"
        },
        {
          "slug": "eslint-duplicate-resolution",
          "title": "deps: eslint ^9.35.0 resolves to 9.39.2 and 9.39.5 in one lockfile",
          "dimension": 5,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Unchanged; a pnpm dedupe pass"
        },
        {
          "slug": "dependabot-security-updates-transitive-not-possible",
          "title": "deps: Dependabot security updates for transitive pnpm dependencies end security_update_not_possible",
          "dimension": 5,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Mechanism gap unchanged; no high alerts open"
        },
        {
          "slug": "ci-scripts-test-list-comment-only",
          "title": "ci: the scripts test list in Check Fast duplicates the root test script with comment-only alignment",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Lists match today (now four node tests)"
        },
        {
          "slug": "deep-checks-red-until-next-schedule",
          "title": "ci: Deep Checks is red on its last runs, all before the mobile export fix",
          "dimension": 3,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "Last run 2026-09-08 at 5f6f91f; next scheduled Fri 2026-09-11 is also the first desktop build with the moved target dir"
        },
        {
          "slug": "required-status-checks-not-enforced",
          "title": "ci: no required status checks, the ruleset is not imported on this repository",
          "dimension": 3,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "API 403 today; ruleset file ready"
        },
        {
          "slug": "code-scanning-uploads-disabled",
          "title": "security: code scanning not enabled, so CodeQL and Trivy results never reach the Security tab",
          "dimension": 7,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Not enabled on this repository"
        }
      ]
    },
    {
      "date": "2026-10-18",
      "commit": "c794e07c2777aace371ee343bf4dfa8d4508de32",
      "mode": "fan-out",
      "agent": "claude",
      "overall": 7.6,
      "dimensions": {
        "1": {
          "score": 8,
          "evidence": "New tooling workspaces follow @repo/* naming; @repo/desk declares exports (tooling/desk/package.json:6-9), @repo/factory-ui exports only ./contracts (tooling/factory-ui/package.json:6-8), @repo/desk-ui is a leaf Vite app; 0 deep @repo/*/src imports, no app or package imports tooling; knip has explicit entries per new workspace (knip.json:83-109); pnpm boundaries exit 0 (984 files, 22 packages), knip exit 0. Observed: the server-only client import block (packages/config/eslint/base.js:77) does not cover tooling/desk-ui and tooling/factory-ui although react.js:56-57 treats them as DOM apps (no violation today); turbo boundaries runs without tag rules"
        },
        "2": {
          "score": 7,
          "evidence": "Down 1 with reproduced cause: turbo run test --filter=@repo/desk --dry=json hashes 310 inputs and none of the root files its tests read (.github/pull_request_template.md read at tooling/desk/src/ship/ship.pr-body.test.ts:12, .github/workflows/ci-pr.yml at ship.changeset.test.ts:122, docs/agents/day-one.md at github.snapshot-fixture.test.ts:14, root commitlint.config.mjs via ship.message.test.ts:16-19); no tooling/*/turbo.json exists, and the Release run on c794e07 reported 32 of 35 test-phase tasks cached, so a stale desk result can pass on main. @repo/config#test scans tooling sources (monorepo-alignment.test.ts:909) but hashes only {apps,packages}/*/src/** (packages/config/turbo.json:27). Global hash still minimal (turbo.json:5). Observed carry-over: @repo/desktop#build builds @repo/web inline without an edge (apps/desktop/package.json:8,21); no automated inputs-versus-reads check"
        },
        "3": {
          "score": 8,
          "evidence": "Binding hold lifted: rulesets 12994169 and 23204248 are active on main and require PR Quality Gate + Analyze TypeScript (gh api repos/.../rules/branches/main); the rule file .github/rulesets/main.json:31-34 is contract-tested against job names (scripts/pr-quality-gate.test.mjs:122-153, monorepo-alignment.test.ts:185-219) and the gate needs every job (pr-quality-gate.test.mjs:104-120); every job has timeout-minutes and every workflow a concurrency block; #456 runs-on expression evaluated for every job (pr-quality-gate.test.mjs:194-254). PR 39166806480 wall clock 6m37s, Docker Image (api) 4m18s on the critical path. Observed: docker-cache.yml:17-31 path list and the ci-pr.yml:218-220 node --test list stay aligned by comment only; two Trivy passes plus SBOM in the image job (ci-pr.yml:469-507); tooling tests are absent from the PR path (see dim 4)"
        },
        "4": {
          "score": 7,
          "evidence": "Down 1 with cause: PR CI never runs tooling workspace tests: Check Fast runs only format:check/lint/typecheck on pull_request (ci-pr.yml:206-213), the coverage projects list has no tooling/* entry (vitest.coverage.config.ts:5-22) and coverage excludes tooling/** without a reason (:51); the PR 488 log has 0 @repo/desk:test lines, while Release on main runs them (cache miss line in run 39166160803), so about 2,200 desk tests first run after merge. The 09-10 conditions for 9 are otherwise met: notes.tenancy.test.ts:1-17,225-345 drives real GraphQL over HTTP through Yoga with a session, and assistant-composer.test.tsx:61-62 renders a component. Coverage on PR 39166806480: 163 files, statements 61.1 / branches 47.32 / functions 49.32 / lines 62.15 vs floors 45/45/40/38. Observed: cross-org e2e still todos-only (web-organization-isolation.e2e.ts:54); invitation e2e skipped (web-invitation-attachment.e2e.ts:17-20); 5 of 17 web tests read source text; floors 13-17 points below measured"
        },
        "5": {
          "score": 8,
          "evidence": "Binding raise condition met: #356 closed and the grouped npm updater run succeeded on 2026-10-12 (26 updates, merged as #471); minimumReleaseAge 4320 matches the Dependabot cooldown (pnpm-workspace.yaml:71-80, dependabot.yml:19-22); catalog gate requires catalog: for any dependency in two or more workspaces (monorepo-alignment.test.ts:574-642); every ignoreGhsas entry has a reason and an issue (#457, #469; pnpm-workspace.yaml:82-92) and both advisories still list no patched version; overrides are caret floors bar the documented metro>image-size pin (:97); five ecosystems with groups and ignores (dependabot.yml:10-178); pnpm audit --audit-level high exit 0 (2 ignored); Dependabot alerts 1 high (node-forge, accepted) / 6 medium / 2 low. Observed: individual security-update runs fail for six transitive packages; the catalog gate skips the root manifest so eslint ^9.35.0 is declared twice (package.json:108, packages/config/package.json:38); tailwindcss and @clack/prompts majors outside ignores"
        },
        "6": {
          "score": 8,
          "evidence": "Release green on the last five main commits (latest 39166160803 at c794e07) and version PR #486 merged; release:apps runs after check:ci, build:core and test:e2e (release.yml:80-91); #376 no-op is a tested pure function (originSyncState, .ai/release.util.spec.ts:81); Dockerfile.api:5 and Dockerfile.web:5,34 digest-pinned with Dependabot digest updates and Node-major ignores (dependabot.yml:121-135); new tooling packages are private and not deployable (only Dockerfile.api and Dockerfile.web exist). Not 9: the git path of .ai/release-apps.ts:168-306 (fetch, merge-base, update-ref, push) still has no test"
        },
        "7": {
          "score": 7,
          "evidence": "Down 1 with cause: the repository is public and code scanning holds 28 open alerts created 2026-09-13..27 with no triage (15 CodeQL, 13 Trivy); the main-branch Trivy alerts come only from manual workflow_dispatch runs (09-13, 09-27) because ci-pr.yml runs on pull_request/merge_group/workflow_dispatch only, so main's image state is never rescanned; the web runner stage (Dockerfile.web:34) never upgrades Alpine packages, unlike Dockerfile.api:7-11, and PR 488's scan shows 5 fixable HIGH OS CVEs (pcre2, tiff, libexpat x2, libx11) that pass because the gate fails only on CRITICAL (ci-pr.yml:492-499); scrypt cost N=16384 (packages/auth/src/auth.password.ts:11) is below the OWASP floor of 2^17 and an unsalted SHA-256 verify fallback has no sunset (:102-106). Still strong: audit exit 0, Gitleaks green, secret scanning + push protection on with 0 alerts, Dependency Review on PRs (ci-pr.yml:124-146), production CORS fails closed (server.config.ts:53-58), notes tenancy proven over HTTP. Most CodeQL highs checked are false positives (auth.util.ts slug regex, notes.hook.ts computed keys, client-only email regex). Observed carry-over: cookie attributes and server password minimum implicit (auth.instance.ts:131-152,174-176); no sweeping tenancy contract"
        },
        "8": {
          "score": 8,
          "evidence": "Every pnpm script named in README.md, CONTRIBUTING.md and docs/agents/day-one.md exists in package.json; bootstrap excludes the Tauri build (package.json:45, monorepo-alignment.test.ts:171); scripts/doctor.mjs:146-172 warns on missing Rust and checks Docker (:274-289); #406 Windows setup fixes; create:feature generator (#385). Observed: .vscode/launch.json:28-30 vitest debug still runs from the root with no workspace config; on a Windows host pnpm check fails in @repo/desk (29 tests: symlinks, POSIX paths) and only docs/agents/agent-desk.md:693-696 says so, with no troubleshooting entry and no platform guard"
        },
        "9": {
          "score": 8,
          "evidence": "pnpm ai:doctor --strict exit 0 (all five agent contracts pass); 09-10 Serena drift fixed (.ai/serena-memories/task_completion_checklist.md:14, suggested_commands.md:14-15); MONOREPO_GUIDE.md:47-49,280 and README.md:35 describe the desk and factory; ADR 0010 and 0011 added; 24 skills match the AGENTS.md index; some facts are manifest-derived (monorepo-alignment.test.ts:94,420-455,690). Not 9: no test checks documented script names or the guide's workspace tree against manifests. Observed: kaine-adopt-template.md:37 keeps the legacy src-tauri/target glob unexplained; .ai/context-audit.ts:99 counts guide words but enforces no ceiling (.ai/guide.md 251 lines)"
        },
        "10": {
          "score": 7,
          "evidence": "Baseline. Offline tier gated in CI: the assistant golden set covers 8 of 9 tools (assistant.tools.ts:30-138 vs assistant.eval.data.ts:54-109), assistant.eval.test.ts:57-126 asserts tool existence, refusals and rubric coverage, assistant.ai-runtime.test.ts pins the system prompt (:217), scope forwarding (:227), an 8-step cap (:239) and call/result pairing (:292), and foreign-organization writes are rejected through real adapters (assistant.eval.fixture.test.ts:79); telemetry records provider, model, tokens, duration, steps, tool calls and failure category (apps/api/src/ai.telemetry.ts:9-18) with an exact-key test that blocks content (assistant.ai-runtime.test.ts:414-438); harness ledger holds 4 runs / 24 trials validated by .ai/harness-eval.spec.ts:55-59 in ai:test; desk run records carry a harness fingerprint (tooling/desk/src/contracts/run-metrics.contract.ts:20-77). Not 9: live evals are opt-in and write to gitignored .ai.local/ (assistant.eval.cli.ts:53-61), so no committed baseline or regression gate exists; the write-tool floor is a hand-kept list (assistant.eval.test.ts:33-41); updateNote has no expected-call case"
        }
      },
      "findings": [
        {
          "slug": "ci-tooling-tests-skip-pr-gate",
          "title": "ci: tooling workspace tests never run on pull requests, so desk regressions first fail after merge",
          "dimension": 4,
          "ladderRank": 1,
          "disposition": "open",
          "issue": 489
        },
        {
          "slug": "desk-test-inputs-missing-root-files",
          "title": "build: the tooling/desk test hash omits the root files its tests read",
          "dimension": 2,
          "ladderRank": 1,
          "disposition": "open",
          "issue": 490
        },
        {
          "slug": "web-image-os-packages-not-refreshed",
          "title": "security: the web image ships fixable high alpine cves because its runner stage never upgrades packages",
          "dimension": 7,
          "ladderRank": 2,
          "disposition": "open",
          "issue": 491
        },
        {
          "slug": "code-scanning-alerts-untriaged",
          "title": "security: 28 code scanning alerts sit untriaged on the public repository",
          "dimension": 7,
          "ladderRank": 2,
          "disposition": "open",
          "issue": 493
        },
        {
          "slug": "scrypt-cost-below-owasp",
          "title": "auth: the scrypt cost n=16384 is below the owasp minimum",
          "dimension": 7,
          "ladderRank": 3,
          "disposition": "open",
          "issue": 492
        },
        {
          "slug": "legacy-sha256-verify-no-sunset",
          "title": "auth: the unsalted sha256 verify fallback has no removal plan",
          "dimension": 7,
          "ladderRank": 4,
          "disposition": "open",
          "reason": "Folded into the scrypt-cost-below-owasp proposal",
          "issue": 492
        },
        {
          "slug": "config-test-inputs-omit-tooling-sources",
          "title": "build: the packages/config test hash omits tooling sources its vitest scan reads",
          "dimension": 2,
          "ladderRank": 4,
          "disposition": "open",
          "reason": "Folded into the desk-test-inputs-missing-root-files proposal",
          "issue": 490
        },
        {
          "slug": "coverage-tooling-exclusion-unexplained",
          "title": "testing: tooling/** is excluded from coverage with no recorded reason",
          "dimension": 4,
          "ladderRank": 5,
          "disposition": "open",
          "reason": "Folded into the ci-tooling-tests-skip-pr-gate proposal",
          "issue": 489
        },
        {
          "slug": "main-trivy-alerts-stale-no-main-scan",
          "title": "security: main-branch trivy alerts come only from manual runs, so they never close",
          "dimension": 7,
          "ladderRank": 5,
          "disposition": "open",
          "reason": "Folded into the code-scanning-alerts-untriaged proposal",
          "issue": 493
        },
        {
          "slug": "cors-429-reflects-origin-without-allowlist",
          "title": "api: the rate-limit 429 path reflects any origin with credentials when no allowlist is set",
          "dimension": 7,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Production cannot start without the allowlist (server.config.ts:53-58); 429 body has no data"
        },
        {
          "slug": "eval-no-regression-baseline",
          "title": "eval: live assistant quality has no committed baseline or regression gate",
          "dimension": 10,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Live evals are deliberately opt-in and cost money; a committed summary ledger is the upgrade"
        },
        {
          "slug": "release-apps-git-path-untested",
          "title": "release: release:apps fetch, ancestry and push path has no test",
          "dimension": 6,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Carried as the 09-10 condition for 9"
        },
        {
          "slug": "windows-desk-tests-undocumented-for-check",
          "title": "dx: windows-host pnpm check fails in @repo/desk with no troubleshooting entry or guard",
          "dimension": 8,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "Documented only in agent-desk.md:693-696; Linux CI is green"
        },
        {
          "slug": "client-import-block-skips-tooling-ui",
          "title": "eslint: the server-only import restriction skips desk-ui and factory-ui",
          "dimension": 1,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Latent; no violation today"
        },
        {
          "slug": "doc-script-refs-not-gated",
          "title": "docs: documented pnpm scripts are not checked against package.json",
          "dimension": 9,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "All resolve today; the known band-8 ceiling"
        },
        {
          "slug": "eval-write-tools-hand-list",
          "title": "eval: the assistant write-tool floor checks a hand-kept list",
          "dimension": 10,
          "ladderRank": 8,
          "disposition": "observed"
        },
        {
          "slug": "eval-update-note-no-golden-call",
          "title": "eval: updateNote has no expected-call golden case",
          "dimension": 10,
          "ladderRank": 8,
          "disposition": "observed"
        },
        {
          "slug": "harness-ledger-render-drift-ungated",
          "title": "harness-eval: generated ledger region drift is not checked",
          "dimension": 10,
          "ladderRank": 9,
          "disposition": "observed"
        },
        {
          "slug": "telemetry-org-scope-untested",
          "title": "telemetry: organization scope on model-call logs is not asserted",
          "dimension": 10,
          "ladderRank": 9,
          "disposition": "observed"
        },
        {
          "slug": "adopt-template-dead-tauri-glob",
          "title": "skills: kaine-adopt-template keeps the legacy src-tauri/target glob unexplained",
          "dimension": 9,
          "ladderRank": 10,
          "disposition": "observed"
        },
        {
          "slug": "ai-guide-no-size-budget",
          "title": "ai: the context audit reports guide size but enforces no ceiling",
          "dimension": 9,
          "ladderRank": 10,
          "disposition": "observed"
        },
        {
          "slug": "dependabot-npm-updater-red-types-node",
          "title": "deps: the Dependabot npm updater job ends in error on @types/node every run",
          "dimension": 5,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 356,
          "reason": "#356 closed; grouped npm updater green 2026-10-12 (#471)"
        },
        {
          "slug": "red-prs-merged-without-required-checks",
          "title": "process: pull requests with failing checks reach main because required checks are not enforced",
          "dimension": 3,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 325,
          "reason": "#325 closed; rulesets active with required checks"
        },
        {
          "slug": "required-status-checks-not-enforced",
          "title": "ci: no required status checks, the ruleset is not imported on this repository",
          "dimension": 3,
          "ladderRank": 5,
          "disposition": "fixed",
          "reason": "Rulesets 12994169 and 23204248 active on main"
        },
        {
          "slug": "code-scanning-uploads-disabled",
          "title": "security: code scanning not enabled, so CodeQL and Trivy results never reach the Security tab",
          "dimension": 7,
          "ladderRank": 5,
          "disposition": "fixed",
          "reason": "Enabled after the public flip; superseded by code-scanning-alerts-untriaged"
        },
        {
          "slug": "no-schema-level-graphql-test",
          "title": "testing: no test runs a session-scoped feature operation through the schema",
          "dimension": 4,
          "ladderRank": 4,
          "disposition": "fixed",
          "reason": "apps/api/src/features/notes/notes.tenancy.test.ts"
        },
        {
          "slug": "deep-checks-red-until-next-schedule",
          "title": "ci: Deep Checks is red on its last runs, all before the mobile export fix",
          "dimension": 3,
          "ladderRank": 9,
          "disposition": "fixed",
          "reason": "Scheduled Deep Checks green 2026-10-16 (38867999412)"
        },
        {
          "slug": "serena-memories-minor-drift",
          "title": "docs: serena task_completion_checklist omits boundaries/knip and suggested_commands omits pnpm preflight",
          "dimension": 9,
          "ladderRank": 10,
          "disposition": "fixed",
          "reason": "task_completion_checklist.md:14, suggested_commands.md:14-15"
        },
        {
          "slug": "desktop-build-hash-omits-web",
          "title": "build: apps/desktop build task hash excludes @repo/web sources and its tauri output is not a turbo output",
          "dimension": 2,
          "ladderRank": 1,
          "disposition": "observed",
          "reason": "Unchanged; cache:false bounds it"
        },
        {
          "slug": "auth-cookie-password-policy-implicit",
          "title": "security: cookie attributes and server password minimum rely on better-auth defaults",
          "dimension": 7,
          "ladderRank": 2,
          "disposition": "observed",
          "reason": "Unchanged (auth.instance.ts:131-152,174-176)"
        },
        {
          "slug": "test-input-coverage-not-gated",
          "title": "build: no automated check that files a test reads appear in its turbo inputs",
          "dimension": 2,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Unchanged; desk-test-inputs-missing-root-files is its first new instance"
        },
        {
          "slug": "e2e-cross-org-todos-only",
          "title": "testing: cross-organization isolation is asserted for todos only",
          "dimension": 4,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Notes now proven below the browser by notes.tenancy.test.ts"
        },
        {
          "slug": "web-tests-source-string-assertions",
          "title": "testing: web feature tests assert on source text, no rendered component tests",
          "dimension": 4,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "5 of 17 still read source text; rendered tests now exist"
        },
        {
          "slug": "tenancy-enforced-by-convention",
          "title": "security: no contract test or lint guarantees every resolver resolves scope from session",
          "dimension": 7,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Unchanged"
        },
        {
          "slug": "dependabot-security-updates-transitive-not-possible",
          "title": "deps: Dependabot security updates for transitive pnpm dependencies end security_update_not_possible",
          "dimension": 5,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Six runs failed 2026-10-12 (postcss-selector-parser, uuid, @humanfs/node, fast-copy, @babel/core, glib)"
        },
        {
          "slug": "docker-image-job-dominated-by-scan-export",
          "title": "ci: the api image job spends about 3m40s on image load, two Trivy passes, and SBOM after a 30s compile",
          "dimension": 3,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Image job 4m18s of 6m37s on PR 39166806480"
        },
        {
          "slug": "docker-cache-path-list-comment-only",
          "title": "ci: docker-cache.yml path list and pins match ci-pr.yml by comment only",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Lists identical today"
        },
        {
          "slug": "ci-scripts-test-list-comment-only",
          "title": "ci: the scripts test list in Check Fast duplicates the root test script with comment-only alignment",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Lists identical today (eight node tests)"
        },
        {
          "slug": "majors-uncovered-by-ignore-or-287",
          "title": "deps: @clack/prompts and the mobile tailwindcss major sit outside ignores and #287",
          "dimension": 5,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Unchanged"
        },
        {
          "slug": "eslint-duplicate-resolution",
          "title": "deps: eslint ^9.35.0 resolves to 9.39.2 and 9.39.5 in one lockfile",
          "dimension": 5,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Root and packages/config both declare ^9.35.0; the catalog gate skips the root manifest"
        },
        {
          "slug": "knip-ignore-stale-and-laundering",
          "title": "tooling: knip.json ignoreDependencies hides two undeclared deps and one unused dep",
          "dimension": 1,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "zod and @repo/config still in knip.json:112-123"
        },
        {
          "slug": "launch-json-vitest-config-broken",
          "title": "dx: .vscode/launch.json vitest debug config runs from the root without a vitest config",
          "dimension": 8,
          "ladderRank": 10,
          "disposition": "observed",
          "reason": "Unchanged (.vscode/launch.json:28-30)"
        }
      ]
    },
    {
      "date": "2026-10-20",
      "commit": "9cf8364f919d60c402691d317959ae5ddec85a8b",
      "mode": "fan-out",
      "agent": "claude",
      "overall": 8,
      "dimensions": {
        "1": {
          "score": 8,
          "evidence": "The DOM client import block covers apps/web, apps/desktop, packages/ui, tooling/desk-ui and tooling/factory-ui (packages/config/eslint/base.js:78-84), proven by an ESLint calculateConfigForFile contract per workspace (monorepo-alignment.test.ts:1091-1138, #519, 30s timeout after #549); knip global zod/@repo/config ignores removed, zod scoped to packages/auth and packages/db, @repo/web scoped to desktop with its reason (knip.json:55,63-70); pnpm boundaries exit 0 (988 files, 22 packages) and knip exit 0, both on every PR (ci-pr.yml:245-246). Not 9: MONOREPO_GUIDE.md does not describe the client-safe versus server-only entry rule (only the .server.ts suffix at :112); the DOM workspace list in the test and the base.js globs are both hand-kept; turbo tag rules were declined (calibration note below)"
        },
        "2": {
          "score": 8,
          "evidence": "Raise condition met: tooling/desk/turbo.json declares every root file desk tests read (#497); a derived inputs-versus-reads contract (monorepo-alignment.test.ts:1316-1454, #517) folds path constants in every tracked test and accepts a read only inside the package, a global dependency, a workspace dependency's build inputs, or the package's test inputs, naming the fix on failure; it surfaced and closed four gaps; desktop build now reaches @repo/web through a turbo edge (apps/desktop/package.json:8,22) and Deep Checks built it green through that edge (run 39406169156). Not 9: the check is a floor, and the probe found a read it misses (the ESLint contract's new ESLint({ cwd: repoRoot }) loads root eslint.config.mjs, which packages/config/turbo.json does not hash); DYNAMIC_READS is self-registered with exact-string needs; MONOREPO_GUIDE.md does not document the inputs rule"
        },
        "3": {
          "score": 8,
          "evidence": "Both 10-18 conditions met: docker-cache paths pinned to the PR docker filter and the node --test list pinned to the root test script and tracked files by tests (scripts/pr-quality-gate.test.mjs:338-356, #513); tooling tests run affected-scoped on the PR path (ci-pr.yml:224-227, #498); the Trivy gate pass reuses setup and DB (ci-pr.yml:507-520, #525: 27-29s to under 1s); changeset gate reads labels live, pinned by a test (#515, #521); rulesets require PR Quality Gate and Analyze TypeScript. CI PR on main (all jobs) 10m22s wall; full-path PRs 7-10 min. Not 9: Docker build inputs (context, file, build-args, cache scope) still match by comment across ci-pr.yml:465-479, docker-cache.yml:64-80 and security.yml:81-96; PNPM_VERSION duplicated in four workflows with a comment guard; SBOM is still a separate image pass (ci-pr.yml:522-528)"
        },
        "4": {
          "score": 8,
          "evidence": "Raise condition met: tooling tests gate PRs (ci-pr.yml:224-227) with a contract test (monorepo-alignment.test.ts:990-997) and the coverage exclusion records its reason (vitest.coverage.config.ts:51-53). Also landed: cross-organization e2e for notes beside todos (web-organization-isolation.e2e.ts:117, #529), invitation acceptance e2e through the auth API with a second browser context (web-invitation-attachment.e2e.ts, #529), schema-level tenancy contract across every organization-scoped field (apps/api/src/server.tenancy.test.ts:257-303, #514), rendered login-form and organization-create-dialog tests replacing source-text ones (#527). Coverage on main run 39406173469: 165 files, statements 64.21 / branches 50.78 / functions 53.51 / lines 65.31 against floors 50/42/45/50 (raised in #527). Not 9: the attachment e2e still skips in CI without E2E_STORAGE_ENABLED; floors trail measured by up to 15 points; only two web components have rendered tests"
        },
        "5": {
          "score": 8,
          "evidence": "The npm non-major group excludes every pattern group (dependabot.yml:44-52) and every dual-catalog package is fully ignored (:108-113), each pinned by a contract test (scripts/pr-quality-gate.test.mjs:403-453, #544, #536) after Dependabot split the better-auth and vitest pairs (#531/#532/#534, recreated as #540); the catalog gate covers the root manifest and eslint is declared once (monorepo-alignment.test.ts:893, #513); minimumReleaseAge 4320 matches the Dependabot cooldown; pnpm audit --audit-level high exit 0 with two tracked ignores (#457, #469); Dependabot alerts high 1 (node-forge, accepted) / medium 5 / low 1. Not 9: transitive security fixes rely on hand-kept override floors with no stale-floor check (pnpm-workspace.yaml:97-133); audit ignores have issue links but no expiry; the queue needed hand repair this week"
        },
        "6": {
          "score": 9,
          "evidence": "The 09-10 condition for 9 is met: runReleaseApps (.ai/release-apps.util.ts:217-252, #523) is pure git against a given repo root, and .ai/release-apps.util.spec.ts:53-186 drives it against a real seed, bare origin, and clone (create then fast-forward, skip unchanged, dry run, behind-origin no-op, non-ancestor refusal, off-main and dirty refusal), proven red by disabling the fast-forward guard, and runs on every PR through ai:test (ci-pr.yml:231). Release queues and never cancels and runs check:ci, build:core and test:e2e first (release.yml:9-13,80-91); Release green on 57f0092, 6bc0ac2 and 9cf8364 after #549 fixed a contract-test timeout on e047bf0; Dockerfiles digest-pinned. Watch: release-branch pushes run one by one (release-apps.util.ts:246-249), so a mid-loop failure can move release/api without release/web"
        },
        "7": {
          "score": 7,
          "evidence": "Two of three raise conditions met: scrypt N=16384 r=8 p=5, the OWASP 16 MiB variant, with bounded stored costs and rehash on login (packages/auth/src/auth.password.ts:14-21, #496); the web runner upgrades Alpine packages weekly (Dockerfile.web:39, #495; web Trivy findings 13 to 0). Also landed: explicit httpOnly/sameSite/secure cookies and a server password minimum (auth.instance.ts:116,138,181-188, #511); a schema-wide tenancy contract (#514); weekly Trivy rescan of main images with SARIF (security.yml, #510), which closed 11 stale alerts; SECURITY.md:65 names the triager and the dispositions. Held at 7 because the third condition is only partly met: Trivy #23 (decode-uri-component 0.2.2) and #24 (uuid 7.0.3) in the api image, fixed only in new majors and reached through the Expo toolchain under @repo/auth, have neither a fix nor a recorded disposition, which SECURITY.md:65 itself requires; CodeQL #3 stays open on purpose, linked to #499. Toward 9: the PR image gate fails only on CRITICAL"
        },
        "8": {
          "score": 8,
          "evidence": "Both observed gaps closed by #513: .vscode/launch.json:29-38 passes the root coverage config, and docs/troubleshooting.md:119-127 documents the Windows-host @repo/desk failure with Linux, WSL, or desk Docker isolation as the path; README.md:92 and troubleshooting.md:117 name the turbo desktop build (#517); a test checks every documented pnpm command against built-ins, root scripts, and bins (scripts/pr-quality-gate.test.mjs:358-385) on every PR. Not 9: no preflight warns a Windows user before pnpm check fails in @repo/desk; nothing exercises the launch config or bootstrap path"
        },
        "9": {
          "score": 8,
          "evidence": "ai:doctor --strict exit 0; the doc-command test now derives command facts from manifests for README, CONTRIBUTING, day-one and AGENTS (#513); kaine-adopt-template.md:40-41 explains the legacy glob; MONOREPO_GUIDE.md:24-52 matches the 22 manifests; 11 ADRs indexed (docs/README.md:26-36); Dependabot grouping comments match the config. Not 9: docs/adr/0005-scrypt-password-hashing.md:15 still says p=1 and :35 says the default is below OWASP, contradicting its own status update at :5 and the code (a #496 miss); no test derives the guide's workspace tree or README's package count; .ai/context-audit.ts:99 reports guide size without a ceiling; the command test skips MONOREPO_GUIDE.md and troubleshooting.md"
        },
        "10": {
          "score": 8,
          "evidence": "Every baseline gap now has a gate (#512): a committed eval ledger with an offline regression check that refuses a lower-scoring run in the same provider/model/dataset series (apps/api/src/features/assistant/assistant.eval.ledger.ts:88-112, proven by a 14/15 to 13/15 case in .ledger.test.ts:42-50) and a strict summary-only schema that rejects prompt content; coverage derived from createAssistantTools minus a read-only allowlist (assistant.eval.test.ts:22-36); an updateNote golden case (assistant.eval.data.ts:115); a telemetry test proving the model-call log line is bound to organizationId and carries no prompt (apps/api/src/ai.telemetry.scope.test.ts:80-95); harness:eval --check in ai:test on PRs; desk run records with a harness fingerprint. Not 9: assistant.eval.ledger.json holds no reviewed live run, so the regression gate has never compared real data, and nothing requires a fresh run when the prompt or dataset hash changes"
        }
      },
      "findings": [
        {
          "slug": "trivy-api-uuid-decode-uri-untriaged",
          "title": "security: trivy #23 and #24 in the api image have no fix or recorded disposition",
          "dimension": 7,
          "ladderRank": 2,
          "disposition": "observed",
          "reason": "Proposed for filing on 2026-10-20; awaiting owner go-ahead"
        },
        {
          "slug": "release-push-non-atomic",
          "title": "release: release:apps pushes release branches one by one, so a failure can split the api and web pair",
          "dimension": 6,
          "ladderRank": 2,
          "disposition": "observed",
          "reason": "Proposed for filing on 2026-10-20; awaiting owner go-ahead"
        },
        {
          "slug": "adr-0005-stale-cost-defaults",
          "title": "docs: adr 0005 body still states p=1 and a below-owasp default, contradicting its status line and the code",
          "dimension": 9,
          "ladderRank": 3,
          "disposition": "observed",
          "reason": "Proposed for filing on 2026-10-20; awaiting owner go-ahead"
        },
        {
          "slug": "eslint-contract-reads-unhashed-root-config",
          "title": "build: the eslint import-block contract reads root eslint.config.mjs, which the config test hash omits",
          "dimension": 2,
          "ladderRank": 3,
          "disposition": "observed",
          "reason": "Proposed for filing on 2026-10-20; awaiting owner go-ahead"
        },
        {
          "slug": "docker-build-inputs-untested",
          "title": "ci: docker build inputs in ci-pr, docker-cache and security match by comment only",
          "dimension": 3,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Proposed for filing on 2026-10-20; awaiting owner go-ahead"
        },
        {
          "slug": "assistant-eval-ledger-empty",
          "title": "eval: the committed assistant eval ledger holds no reviewed live run",
          "dimension": 10,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Recording a run needs paid model calls and owner review; owner decision"
        },
        {
          "slug": "assistant-eval-prompt-drift-unrecorded",
          "title": "eval: no check requires a fresh ledger run when the prompt or dataset hash changes",
          "dimension": 10,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Depends on a first recorded run"
        },
        {
          "slug": "legacy-sha256-verify-no-sunset",
          "title": "auth: the unsalted sha256 verify fallback has no removal plan",
          "dimension": 7,
          "ladderRank": 4,
          "disposition": "open",
          "issue": 499,
          "reason": "Kept by owner decision until 2027-01-04 or zero legacy hashes"
        },
        {
          "slug": "server-only-split-undocumented",
          "title": "docs: monorepo guide does not describe the client-safe versus server-only entry rule",
          "dimension": 1,
          "ladderRank": 6,
          "disposition": "observed"
        },
        {
          "slug": "inputs-rule-undocumented-in-guide",
          "title": "docs: monorepo guide does not explain the turbo test-inputs contract",
          "dimension": 2,
          "ladderRank": 6,
          "disposition": "observed"
        },
        {
          "slug": "dynamic-reads-self-registration",
          "title": "build: DYNAMIC_READS depends on authors registering git walks and subprocess tests",
          "dimension": 2,
          "ladderRank": 7,
          "disposition": "observed"
        },
        {
          "slug": "transitive-security-via-manual-overrides",
          "title": "deps: transitive security fixes rely on hand-kept override floors with no stale-floor check",
          "dimension": 5,
          "ladderRank": 5,
          "disposition": "observed"
        },
        {
          "slug": "audit-ignores-no-expiry",
          "title": "deps: audit ignores have issue links but no expiry",
          "dimension": 5,
          "ladderRank": 8,
          "disposition": "observed"
        },
        {
          "slug": "invitation-attachment-e2e-skipped-in-ci",
          "title": "testing: the attachment e2e skips in ci without e2e_storage_enabled",
          "dimension": 4,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Needs S3/MinIO in CI"
        },
        {
          "slug": "coverage-floors-far-below-measured",
          "title": "testing: global floors trail measured coverage by up to 15 points",
          "dimension": 4,
          "ladderRank": 8,
          "disposition": "observed"
        },
        {
          "slug": "web-rendered-tests-thin",
          "title": "testing: only two web components have rendered tests",
          "dimension": 4,
          "ladderRank": 8,
          "disposition": "observed"
        },
        {
          "slug": "trivy-pr-gate-critical-only",
          "title": "security: high image vulnerabilities do not fail pull requests",
          "dimension": 7,
          "ladderRank": 7,
          "disposition": "observed"
        },
        {
          "slug": "pnpm-version-duplicated",
          "title": "ci: pnpm version is repeated in four workflows with a comment guard",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "observed"
        },
        {
          "slug": "sbom-separate-pass",
          "title": "ci: the sbom step reanalyses the image instead of reusing the trivy cache",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "observed"
        },
        {
          "slug": "tag-release-steps-untested",
          "title": "release: tag push and github release steps are inline bash without a test",
          "dimension": 6,
          "ladderRank": 8,
          "disposition": "observed"
        },
        {
          "slug": "windows-desk-no-preflight",
          "title": "dx: no preflight warns windows users before pnpm check fails in @repo/desk",
          "dimension": 8,
          "ladderRank": 8,
          "disposition": "observed"
        },
        {
          "slug": "guide-size-budget-unenforced",
          "title": "ai: the context audit reports guide size but enforces no ceiling",
          "dimension": 9,
          "ladderRank": 9,
          "disposition": "observed"
        },
        {
          "slug": "workspace-tree-not-derived",
          "title": "docs: no test derives the guide workspace tree or readme package count from manifests",
          "dimension": 9,
          "ladderRank": 9,
          "disposition": "observed"
        },
        {
          "slug": "dom-workspace-list-hand-maintained",
          "title": "lint: the dom workspace list in base.js and its contract test are both hand-kept",
          "dimension": 1,
          "ladderRank": 9,
          "disposition": "observed"
        },
        {
          "slug": "e2e-shard-comment-stale",
          "title": "ci: the e2e shard comment says 5 spec files, there are 15",
          "dimension": 4,
          "ladderRank": 10,
          "disposition": "observed"
        },
        {
          "slug": "ci-tooling-tests-skip-pr-gate",
          "title": "ci: tooling workspace tests never run on pull requests, so desk regressions first fail after merge",
          "dimension": 4,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 489,
          "reason": "#498"
        },
        {
          "slug": "desk-test-inputs-missing-root-files",
          "title": "build: the tooling/desk test hash omits the root files its tests read",
          "dimension": 2,
          "ladderRank": 1,
          "disposition": "fixed",
          "issue": 490,
          "reason": "#497"
        },
        {
          "slug": "web-image-os-packages-not-refreshed",
          "title": "security: the web image ships fixable high alpine cves because its runner stage never upgrades packages",
          "dimension": 7,
          "ladderRank": 2,
          "disposition": "fixed",
          "issue": 491,
          "reason": "#495; web Trivy findings 13 to 0"
        },
        {
          "slug": "scrypt-cost-below-owasp",
          "title": "auth: the scrypt cost n=16384 is below the owasp minimum",
          "dimension": 7,
          "ladderRank": 3,
          "disposition": "fixed",
          "issue": 492,
          "reason": "#496 (N=2^14, r=8, p=5)"
        },
        {
          "slug": "code-scanning-alerts-untriaged",
          "title": "security: 28 code scanning alerts sit untriaged on the public repository",
          "dimension": 7,
          "ladderRank": 2,
          "disposition": "fixed",
          "issue": 493,
          "reason": "14 CodeQL dismissed with reasons, 11 stale Trivy closed by the main rescan; two new Trivy findings tracked as trivy-api-uuid-decode-uri-untriaged"
        },
        {
          "slug": "main-trivy-alerts-stale-no-main-scan",
          "title": "security: main-branch trivy alerts come only from manual runs, so they never close",
          "dimension": 7,
          "ladderRank": 5,
          "disposition": "fixed",
          "issue": 493,
          "reason": "#510 weekly rescan; 11 alerts closed on 2026-10-20"
        },
        {
          "slug": "test-input-coverage-not-gated",
          "title": "build: no automated check that files a test reads appear in its turbo inputs",
          "dimension": 2,
          "ladderRank": 4,
          "disposition": "fixed",
          "reason": "#517 derived check (a floor; see eslint-contract-reads-unhashed-root-config)"
        },
        {
          "slug": "desktop-build-hash-omits-web",
          "title": "build: apps/desktop build task hash excludes @repo/web sources and its tauri output is not a turbo output",
          "dimension": 2,
          "ladderRank": 1,
          "disposition": "fixed",
          "reason": "#517 turbo edge; Deep Checks green"
        },
        {
          "slug": "tenancy-enforced-by-convention",
          "title": "security: no contract test or lint guarantees every resolver resolves scope from session",
          "dimension": 7,
          "ladderRank": 4,
          "disposition": "fixed",
          "reason": "#514 schema-wide tenancy contract"
        },
        {
          "slug": "auth-cookie-password-policy-implicit",
          "title": "security: cookie attributes and server password minimum rely on better-auth defaults",
          "dimension": 7,
          "ladderRank": 2,
          "disposition": "fixed",
          "reason": "#511"
        },
        {
          "slug": "e2e-cross-org-todos-only",
          "title": "testing: cross-organization isolation is asserted for todos only",
          "dimension": 4,
          "ladderRank": 4,
          "disposition": "fixed",
          "reason": "#529 notes case"
        },
        {
          "slug": "client-import-block-skips-tooling-ui",
          "title": "eslint: the server-only import restriction skips desk-ui and factory-ui",
          "dimension": 1,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "#519"
        },
        {
          "slug": "knip-ignore-stale-and-laundering",
          "title": "tooling: knip.json ignoreDependencies hides two undeclared deps and one unused dep",
          "dimension": 1,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "#519"
        },
        {
          "slug": "docker-cache-path-list-comment-only",
          "title": "ci: docker-cache.yml path list and pins match ci-pr.yml by comment only",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "#513 (paths); build inputs remain, see docker-build-inputs-untested"
        },
        {
          "slug": "ci-scripts-test-list-comment-only",
          "title": "ci: the scripts test list in Check Fast duplicates the root test script with comment-only alignment",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "#513"
        },
        {
          "slug": "eslint-duplicate-resolution",
          "title": "deps: eslint ^9.35.0 resolves to 9.39.2 and 9.39.5 in one lockfile",
          "dimension": 5,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "#513 catalog gate on the root manifest"
        },
        {
          "slug": "majors-uncovered-by-ignore-or-287",
          "title": "deps: @clack/prompts and the mobile tailwindcss major sit outside ignores and #287",
          "dimension": 5,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "#521/#536 tailwindcss fully ignored; @clack/prompts left as single owner-reviewed PRs by decision"
        },
        {
          "slug": "launch-json-vitest-config-broken",
          "title": "dx: .vscode/launch.json vitest debug config runs from the root without a vitest config",
          "dimension": 8,
          "ladderRank": 10,
          "disposition": "fixed",
          "reason": "#513"
        },
        {
          "slug": "windows-desk-tests-undocumented-for-check",
          "title": "dx: windows-host pnpm check fails in @repo/desk with no troubleshooting entry or guard",
          "dimension": 8,
          "ladderRank": 7,
          "disposition": "fixed",
          "reason": "#513 troubleshooting entry; guard tracked as windows-desk-no-preflight"
        },
        {
          "slug": "doc-script-refs-not-gated",
          "title": "docs: documented pnpm scripts are not checked against package.json",
          "dimension": 9,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "#513"
        },
        {
          "slug": "adopt-template-dead-tauri-glob",
          "title": "skills: kaine-adopt-template keeps the legacy src-tauri/target glob unexplained",
          "dimension": 9,
          "ladderRank": 10,
          "disposition": "fixed",
          "reason": "#513"
        },
        {
          "slug": "eval-no-regression-baseline",
          "title": "eval: live assistant quality has no committed baseline or regression gate",
          "dimension": 10,
          "ladderRank": 5,
          "disposition": "fixed",
          "reason": "#512 ledger and gate; data tracked as assistant-eval-ledger-empty"
        },
        {
          "slug": "eval-write-tools-hand-list",
          "title": "eval: the assistant write-tool floor checks a hand-kept list",
          "dimension": 10,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "#512"
        },
        {
          "slug": "eval-update-note-no-golden-call",
          "title": "eval: updateNote has no expected-call golden case",
          "dimension": 10,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "#512"
        },
        {
          "slug": "harness-ledger-render-drift-ungated",
          "title": "harness-eval: generated ledger region drift is not checked",
          "dimension": 10,
          "ladderRank": 9,
          "disposition": "fixed",
          "reason": "#512 harness:eval --check in ai:test"
        },
        {
          "slug": "telemetry-org-scope-untested",
          "title": "telemetry: organization scope on model-call logs is not asserted",
          "dimension": 10,
          "ladderRank": 9,
          "disposition": "fixed",
          "reason": "#512 ai.telemetry.scope.test.ts"
        },
        {
          "slug": "dependabot-security-updates-transitive-not-possible",
          "title": "deps: Dependabot security updates for transitive pnpm dependencies end security_update_not_possible",
          "dimension": 5,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Covered by override floors; see transitive-security-via-manual-overrides"
        }
      ]
    },
    {
      "date": "2026-11-02",
      "commit": "87b82197238dc547770b3443a59dcb83f52d029b",
      "mode": "fan-out",
      "agent": "desk-job",
      "overall": 7.7,
      "dimensions": {
        "1": {
          "score": 7,
          "evidence": "Gates green: sweep boundaries exit 0 (1500 files / 27 packages), knip exit 0, both on every PR (ci-pr.yml:244-245). The deep-import block covers all workspaces (packages/config/eslint/base.js:61-72), and the DOM block includes the new ui-3d (base.js:78-84; monorepo-alignment.test.ts:1068-1074). No @repo/*/src|dist imports; every packages/* manifest declares exports without wildcards. Drop: SERVER_ONLY_ENTRY_PATTERN (base.js:14-15) misses the Node-only @repo/billing (packages/billing/src/index.ts:6-7 re-exports stripe/paddle) and @repo/jobs (packages/jobs/package.json:32-35), and its contract list (monorepo-alignment.test.ts:1022-1031) omits both. The test-presence list (:1105-1124) omits billing, jobs, sync and ui-3d.",
          "calibration": "8→7 with cause: hand-kept lists lagged the 22→27 package wave. Raise back to 8 when billing and jobs are in the server-only pattern and its contract."
        },
        "2": {
          "score": 8,
          "evidence": "The derived inputs-vs-reads contract is intact (monorepo-alignment.test.ts:1316-1413). No new workspace turbo.json misses test inputs. The global hash is tsconfig.base.json plus pnpm-workspace.yaml (turbo.json:5). Still open: the ESLint contract loads root eslint.config.mjs (:1053), unhashed by packages/config/turbo.json:12-32; DYNAMIC_READS is hand-registered (:282-317); the inputs rule is absent from MONOREPO_GUIDE.md. Unconfirmed lead: lint (turbo.json:50-58) runs typed rules with no ^ edge."
        },
        "3": {
          "score": 8,
          "evidence": "sweep: two active rulesets; every main workflow green; PR runs 6-8 min (41475943662). SBOM now reuses the Trivy cache (ci-pr.yml:546-555, release.yml:297-305), so sbom-separate-pass is fixed. Self-hosted routing admits only same-repo PR heads on a private repo (ci-pr.yml:22). The watchdog runs with permissions {} (runner-watchdog.yml:23). Not 9: Docker build inputs are matched by comment across four copies (ci-pr.yml:492-503, docker-cache.yml:73-80, security.yml:88-96, .github/actions/app-image/action.yml:51-64). PNPM_VERSION has six copies with no test (ci-pr.yml:17, release.yml:28, security.yml:20, deep-checks.yml:16, Dockerfile.api:14, Dockerfile.web:8). The PR image matrices list apps by hand (scripts/ci-affected.mjs:6-9)."
        },
        "4": {
          "score": 8,
          "evidence": "Run 41475943662: 70.72/65.6/66.14/71.91 against floors 50/42/45/50 (vitest.coverage.config.ts:78-82). Exclusions carry reasons (:57-64). The tenancy contract sweeps every root field from apiTypeDefs (server.tenancy.test.ts:76,307-338). Rendered web tests grew 2→29. Request-level hardening tests exist (server.hardening.test.ts:98-236). Not 9: floors trail measured by 21-24 points; the attachment e2e skips in CI (web-invitation-attachment.e2e.ts:90-94); billing and sync have no per-package floor."
        },
        "5": {
          "score": 8,
          "evidence": "Audit exit 0 with no ignores (no auditConfig/ignoreGhsas anywhere, so audit-ignores-no-expiry is moot). Dependabot covers npm, actions, docker, cargo and compose (dependabot.yml:10,117,139,160,181). Catalog and grouping contracts hold (monorepo-alignment.test.ts:841-910; scripts/pr-quality-gate.test.mjs:506-556). minimumReleaseAge is 4320 (pnpm-workspace.yaml:136). Not 9: override floors are stale against open alerts (minimatch ^10.2.3 at :148 holds 10.2.6; fast-uri@3 ^3.1.6 at :186 holds 3.1.8). Majors on the coupled catalog pins @simplewebauthn/server and wa-sqlite are not ignored (pnpm-workspace.yaml:15-18,49-59 against dependabot.yml:57-113; open PRs #828 and #829). The Cargo glib alert has been open since 2026-07-27."
        },
        "6": {
          "score": 8,
          "evidence": "Main Release is green on five commits (sweep). GHCR publish is well gated: main-only and non-fork (release.yml:225-229), job-level packages:write (:233-238), Trivy CRITICAL before push, and the scanned tarball is pushed with digest validation (app-image/action.yml:66-101). The release:apps git path is still tested (.ai/release-apps.util.spec.ts). Drop: release.yml:204-397 publish-images, deploy-images and the app-image action have no test. Pushes are still one by one (.ai/release-apps.util.ts:246-249). $GITHUB_OUTPUT is written only after runReleaseApps returns (.ai/release-apps.ts:99-106), so a mid-loop failure skips deploy for the app that already moved, and a rerun skips it too (util.ts:199-201). Rulesets target only the default branch (.github/rulesets/main.json:8). Version PR #815 runs are held action_required by repo-setup.json:20, while release.yml:155-158 and docs/release-checklist.md:60 describe 'no runs'.",
          "calibration": "9→8 with cause, not a split release: the 10-20 band-9 grade rested on a fully tested release path. #715 added image publish and deploy steps with no test, and the non-atomic push now also loses the deploy-image output. Raise back to 9 when the push is atomic (or the output is written per branch) and the publish/deploy path has a test."
        },
        "7": {
          "score": 8,
          "evidence": "Binding 10-20 condition met: Trivy #23 is fixed by the decode-uri-component ^0.5.1 override (pnpm-workspace.yaml:187-190) and #24 by xcode>uuid ^11.1.1 (:168-170); sweep code-scanning shows neither open. The SHA-256 fallback is removed (auth.instance.ts:1061-1064; auth.password.test.ts:43-47). Billing webhooks verify the signature first and derive the organization on the server (billing.webhook.ts:39-82,135-144). API-key scope is derived on the server and rate-limited before lookup (server.ts:258-325; api-keys.tenancy.test.ts:268-392). Actions are SHA-pinned and base images digest-pinned. Not 9: the PR image gate is CRITICAL-only (ci-pr.yml:535-542); CSP and HSTS live only in apps/web/nginx.conf:72,88 with no test; #98 and #99 have no recorded disposition; the pruner installs an unpinned turbo@2 (Dockerfile.api:18).",
          "calibration": "Raised 7→8 per the 10-20 binding condition."
        },
        "8": {
          "score": 8,
          "evidence": "doctor.mjs:97-103 checks the RustFS ports (docker-compose.yml:26-27). bootstrap (package.json:48) builds the new packages with plain tsc. .env.example documents billing (:136-154), jobs (:57), retention (:118-126) and storage expiry (:103-104). Not 9: no Windows preflight (scripts/doctor.mjs:530-545); no test checks .env.example against the env schema."
        },
        "9": {
          "score": 6,
          "evidence": "sweep ai-doctor --strict exit 0 (31 skills, no drift); CONTEXT.md:59-99 defines the new domain terms. Ungated drift: MONOREPO_GUIDE.md:24-54 lists 15 of 18 packages and :49 lists the non-workspace tooling/ci-runners. README.md:52,86 say thirteen shared packages. The docs/README.md:29-41 index lists 13 of 19 ADRs. docs/adr/0017-keep-pnpm-and-turborepo.md:23,40,51 cite a missing ADR 0016. ADR 0005 (:16,36) is still stale. .ai/serena-memories/project_overview.md:10-18 is stale. The audit-ignore location in security.yml:37-40 disagrees with SECURITY.md:85.",
          "calibration": "8→6 with cause: the 22→27 package wave left four hand-written structure facts wrong and no gate failed. This fits the 5-6 band. Raise back to 8 when the facts are corrected; 9 needs manifest-derived checks."
        },
        "10": {
          "score": 8,
          "evidence": "Eval coverage is derived from createAssistantTools minus READ_ONLY_TOOLS (assistant.eval.test.ts:13-27,65-83). All 7 write tools have a golden case and a schema case (assistant.eval.data.ts:57-115,211-257). The harness-eval ledger holds 7 runs, the latest 2026-10-20 (docs/agents/harness-evals.md:257-918). Its --check render gate runs on PRs (.ai/harness-eval.ts:400-402; ci-pr.yml:264-269). Telemetry scope test: apps/api/src/ai.telemetry.scope.test.ts:74-105. The desk fingerprint is recorded per run (pipeline.agent.ts:377). Not 9: the assistant ledger is empty (assistant.eval.ledger.json:3); there is no hash freshness check (assistant.eval.ledger.ts:92); the todo generator has no golden set."
        }
      },
      "findings": [
        {
          "slug": "server-only-regex-misses-billing-jobs",
          "title": "eslint: the server-only import block does not cover @repo/billing or @repo/jobs",
          "dimension": 1,
          "ladderRank": 3,
          "disposition": "open",
          "reason": "Proposed for filing; base.js:14-15, monorepo-alignment.test.ts:1022-1031"
        },
        {
          "slug": "release-apps-output-lost-on-partial-push",
          "title": "release: a failed release-branch push writes no deploy output, so the app that already moved never deploys",
          "dimension": 6,
          "ladderRank": 3,
          "disposition": "open",
          "reason": "Proposed for filing together with release-push-non-atomic; .ai/release-apps.ts:99-106, .ai/release-apps.util.ts:246-249"
        },
        {
          "slug": "release-push-non-atomic",
          "title": "release: release:apps pushes release branches one by one, so a failure can split the api and web pair",
          "dimension": 6,
          "ladderRank": 2,
          "disposition": "open",
          "reason": "Still present (.ai/release-apps.util.ts:246-249); folded into the release-apps-output-lost-on-partial-push proposal"
        },
        {
          "slug": "guide-workspace-tree-stale",
          "title": "docs: monorepo guide tree, readme package count, and adr index miss the packages and adrs added since october",
          "dimension": 9,
          "ladderRank": 3,
          "disposition": "open",
          "reason": "Proposed for filing"
        },
        {
          "slug": "adr-0016-dangling-reference",
          "title": "docs: adr 0017 cites adr 0016, which does not exist",
          "dimension": 9,
          "ladderRank": 4,
          "disposition": "open",
          "reason": "Folded into guide-workspace-tree-stale"
        },
        {
          "slug": "readme-package-count-stale",
          "title": "docs: readme says thirteen shared packages, there are 18",
          "dimension": 9,
          "ladderRank": 3,
          "disposition": "open",
          "reason": "Folded into guide-workspace-tree-stale"
        },
        {
          "slug": "adr-index-incomplete",
          "title": "docs: the adr index lists 13 of 19 adrs",
          "dimension": 9,
          "ladderRank": 4,
          "disposition": "open",
          "reason": "Folded into guide-workspace-tree-stale"
        },
        {
          "slug": "serena-project-overview-stale",
          "title": "ai: the serena project overview omits passkey, magic link, api key and five packages",
          "dimension": 9,
          "ladderRank": 5,
          "disposition": "open",
          "reason": "Folded into guide-workspace-tree-stale"
        },
        {
          "slug": "adr-0005-stale-cost-defaults",
          "title": "docs: adr 0005 body still states p=1 and a below-owasp default, contradicting its status line and the code",
          "dimension": 9,
          "ladderRank": 3,
          "disposition": "open",
          "reason": "Folded into guide-workspace-tree-stale"
        },
        {
          "slug": "image-publish-deploy-jobs-untested",
          "title": "release: the ghcr publish and deploy jobs and the app-image action have no test",
          "dimension": 6,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "release.yml:204-397; band-9 gap, no failure reproduced"
        },
        {
          "slug": "release-branches-unprotected",
          "title": "release: rulesets cover only main, so a push to release/<app> deploys without the main gates",
          "dimension": 6,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "main.json:8, main-owner.json:7; needs write access; owner decision"
        },
        {
          "slug": "version-pr-runs-held-docs-stale",
          "title": "release: version pr ci runs wait for approval while docs say they never start",
          "dimension": 6,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "repo-setup.json:20; release.yml:155-158; docs/release-checklist.md:60. Holds #815 required checks until the owner approves. Replaces changeset-release-ci-action-required"
        },
        {
          "slug": "changeset-release-ci-action-required",
          "title": "ci: CI PR runs on changeset-release/main end action_required",
          "dimension": 3,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Cause found: fork_pr_contributor_approval (repo-setup.json:20); tracked as version-pr-runs-held-docs-stale"
        },
        {
          "slug": "dependabot-majors-on-coupled-catalog-pins",
          "title": "deps: dependabot proposes majors for simplewebauthn and wa-sqlite that the catalog says must move with another package",
          "dimension": 5,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "pnpm-workspace.yaml:15-18,49-59 against dependabot.yml:57-113; PRs #828 and #829. Close or ignore via kaine-triage-deps"
        },
        {
          "slug": "docker-pruner-turbo-unpinned",
          "title": "deploy: the docker pruner installs turbo@2 unpinned while the lockfile has 2.11.10",
          "dimension": 6,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Dockerfile.api:18, Dockerfile.web:12"
        },
        {
          "slug": "ci-runner-images-tag-pinned",
          "title": "ci: self-hosted dind and buildkit images are tag-pinned outside dependabot",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "scale-set.values.yaml:41, cluster.yaml:28,97"
        },
        {
          "slug": "audit-ignore-doc-drift",
          "title": "docs: security.yml points at package.json auditConfig while SECURITY.md names pnpm-workspace.yaml",
          "dimension": 5,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "security.yml:37-40 against SECURITY.md:85"
        },
        {
          "slug": "csp-hsts-headers-untested",
          "title": "security: csp and hsts headers exist only in the nginx template with no test",
          "dimension": 7,
          "ladderRank": 3,
          "disposition": "observed",
          "reason": "apps/web/nginx.conf:72,88; a missing test, no failure reproduced"
        },
        {
          "slug": "turbo-lint-hash-omits-dependency-types",
          "title": "build: turbo lint has no ^ edge while typed rules read dependency types",
          "dimension": 2,
          "ladderRank": 2,
          "disposition": "observed",
          "reason": "Lead only; needs a --dry=json hash comparison before filing"
        },
        {
          "slug": "test-presence-list-misses-new-packages",
          "title": "testing: the ship-a-test list omits billing, jobs, sync and ui-3d",
          "dimension": 1,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Latent (monorepo-alignment.test.ts:1105-1124)"
        },
        {
          "slug": "minimatch-override-pins-below-fixed-major",
          "title": "deps: the minimatch ^10.2.3 override holds the tree below the 11.0.1 fix",
          "dimension": 5,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "pnpm-workspace.yaml:146-148"
        },
        {
          "slug": "trivy-medium-alerts-no-recorded-disposition",
          "title": "security: trivy #98 and #99 have no recorded fix or disposition",
          "dimension": 7,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "SECURITY.md:87"
        },
        {
          "slug": "billing-sync-no-per-package-coverage-floor",
          "title": "testing: billing and sync are measured only against the global floor",
          "dimension": 4,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "vitest.coverage.config.ts:83-105"
        },
        {
          "slug": "api-key-access-change-refusal-hand-listed",
          "title": "security: the api-key access-change refusal test names five mutations instead of sweeping the schema",
          "dimension": 7,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "api-keys.tenancy.test.ts:328-359"
        },
        {
          "slug": "todo-generation-eval-absent",
          "title": "eval: the todo generator has no golden set or ledger",
          "dimension": 10,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "todos.ai-runtime.test.ts:56-162"
        },
        {
          "slug": "desk-opencode-skill-evidence-unrecorded",
          "title": "desk: no offline replay or skill-read fixture for the opencode provider",
          "dimension": 10,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "agent.replay.ts:14-15, agent.verify.test.ts:11-12"
        },
        {
          "slug": "serena-env-memory-incomplete",
          "title": "ai: the serena environment memory lists no billing, jobs, retention or split storage expiry variables",
          "dimension": 9,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "environment_setup.md:12-35"
        },
        {
          "slug": "env-example-coverage-ungated",
          "title": "dx: no test checks that .env.example covers the api env schema",
          "dimension": 8,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Correct today"
        },
        {
          "slug": "trivy-api-minimatch-glob-medium",
          "title": "security: trivy #98 and #99 (glob 13.0.5, minimatch 10.2.6) open in the api image",
          "dimension": 7,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Medium; the fixes are new majors"
        },
        {
          "slug": "cargo-glib-alert-open-since-july",
          "title": "deps: Cargo glib 0.18.5 Dependabot alert open since 2026-07-27",
          "dimension": 5,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "Needs glib 0.20 through Tauri/GTK"
        },
        {
          "slug": "trivy-api-uuid-decode-uri-untriaged",
          "title": "security: trivy #23 and #24 in the api image have no fix or recorded disposition",
          "dimension": 7,
          "ladderRank": 2,
          "disposition": "fixed",
          "reason": "Overrides at pnpm-workspace.yaml:168-170 and :187-190"
        },
        {
          "slug": "legacy-sha256-verify-no-sunset",
          "title": "auth: the unsalted sha256 verify fallback has no removal plan",
          "dimension": 7,
          "ladderRank": 4,
          "disposition": "fixed",
          "issue": 499,
          "reason": "auth.instance.ts:1061-1064"
        },
        {
          "slug": "web-rendered-tests-thin",
          "title": "testing: only two web components have rendered tests",
          "dimension": 4,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "29 rendered web test files"
        },
        {
          "slug": "sbom-separate-pass",
          "title": "ci: the sbom step reanalyses the image instead of reusing the trivy cache",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "ci-pr.yml:546-555 skip-setup-trivy"
        },
        {
          "slug": "audit-ignores-no-expiry",
          "title": "deps: audit ignores have issue links but no expiry",
          "dimension": 5,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "No audit ignores remain"
        },
        {
          "slug": "eslint-contract-reads-unhashed-root-config",
          "title": "build: the eslint import-block contract reads root eslint.config.mjs, which the config test hash omits",
          "dimension": 2,
          "ladderRank": 3,
          "disposition": "observed",
          "reason": "Still open (monorepo-alignment.test.ts:1053)"
        },
        {
          "slug": "docker-build-inputs-untested",
          "title": "ci: docker build inputs in ci-pr, docker-cache, security and app-image match by comment only",
          "dimension": 3,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Now four copies (app-image/action.yml:51-64)"
        },
        {
          "slug": "pnpm-version-duplicated",
          "title": "ci: pnpm version is repeated in four workflows and two dockerfiles",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Six copies, no test"
        },
        {
          "slug": "tag-release-steps-untested",
          "title": "release: tag push and github release steps are inline bash without a test",
          "dimension": 6,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "release.yml:165-199"
        },
        {
          "slug": "assistant-eval-ledger-empty",
          "title": "eval: the committed assistant eval ledger holds no reviewed live run",
          "dimension": 10,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Owner decision"
        },
        {
          "slug": "assistant-eval-prompt-drift-unrecorded",
          "title": "eval: no check requires a fresh ledger run when the prompt or dataset hash changes",
          "dimension": 10,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "assistant.eval.ledger.ts:92"
        },
        {
          "slug": "server-only-split-undocumented",
          "title": "docs: monorepo guide does not describe the client-safe versus server-only entry rule",
          "dimension": 1,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "MONOREPO_GUIDE.md:56"
        },
        {
          "slug": "inputs-rule-undocumented-in-guide",
          "title": "docs: monorepo guide does not explain the turbo test-inputs contract",
          "dimension": 2,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Still open"
        },
        {
          "slug": "dynamic-reads-self-registration",
          "title": "build: DYNAMIC_READS depends on authors registering git walks and subprocess tests",
          "dimension": 2,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "Still open"
        },
        {
          "slug": "transitive-security-via-manual-overrides",
          "title": "deps: transitive security fixes rely on hand-kept override floors with no stale-floor check",
          "dimension": 5,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Stale floors at pnpm-workspace.yaml:148,186"
        },
        {
          "slug": "invitation-attachment-e2e-skipped-in-ci",
          "title": "testing: the attachment e2e skips in ci without e2e_storage_enabled",
          "dimension": 4,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "web-invitation-attachment.e2e.ts:90-94"
        },
        {
          "slug": "coverage-floors-far-below-measured",
          "title": "testing: global floors trail measured coverage by 21-24 points",
          "dimension": 4,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "vitest.coverage.config.ts:68-82"
        },
        {
          "slug": "trivy-pr-gate-critical-only",
          "title": "security: high image vulnerabilities do not fail pull requests",
          "dimension": 7,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "ci-pr.yml:535-542"
        },
        {
          "slug": "windows-desk-no-preflight",
          "title": "dx: no preflight warns windows users before pnpm check fails in @repo/desk",
          "dimension": 8,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "scripts/doctor.mjs:530-545"
        },
        {
          "slug": "guide-size-budget-unenforced",
          "title": "ai: the context audit reports guide size but enforces no ceiling",
          "dimension": 9,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": ".ai/context-audit.ts:93-107"
        },
        {
          "slug": "workspace-tree-not-derived",
          "title": "docs: no test derives the guide workspace tree or readme package count from manifests",
          "dimension": 9,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "The predicted drift happened"
        },
        {
          "slug": "dom-workspace-list-hand-maintained",
          "title": "lint: the dom workspace list in base.js and its contract test are both hand-kept",
          "dimension": 1,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "Three lists; in sync this cycle"
        },
        {
          "slug": "e2e-shard-comment-stale",
          "title": "ci: the e2e shard comment says 5 spec files, there are 26",
          "dimension": 4,
          "ladderRank": 10,
          "disposition": "observed",
          "reason": "ci-pr.yml:576"
        },
        {
          "slug": "dependabot-security-updates-transitive-not-possible",
          "title": "deps: Dependabot security updates for transitive pnpm dependencies end security_update_not_possible",
          "dimension": 5,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Covered by override floors"
        }
      ]
    },
    {
      "date": "2026-11-04",
      "commit": "7766e2957a700df9da334f839b24e308c8956bf9",
      "mode": "fan-out",
      "agent": "desk-job",
      "overall": 7.9,
      "dimensions": {
        "1": {
          "score": 7,
          "evidence": "sweep: boundaries exit 0 (1540 files / 27 packages), knip exit 0. No wildcard exports and no @repo/*/src imports (deep-import rule at packages/config/eslint/base.js:61-72). The DOM gate includes ui-3d (monorepo-alignment.test.ts:1072). Still open (#846): SERVER_ONLY_ENTRY_PATTERN (base.js:14-15) covers only storage/auth/db/email, while billing (packages/billing/src/index.ts:6-7) and jobs (packages/jobs/src/index.ts:1-8) are Node-only. The contract list (monorepo-alignment.test.ts:1022-1031) omits both. The test-presence list (:1105-1124) still omits billing, jobs, sync and ui-3d.",
          "calibration": "Held at 7 per the 11-02 binding note. Raise to 8 when #846 lands."
        },
        "2": {
          "score": 8,
          "evidence": "Global hash turbo.json:5-6. Inputs-vs-reads check at monorepo-alignment.test.ts:1374-1397, with DYNAMIC_READS hand-registered at :282-317. The ESLint contract loads root eslint.config.mjs (:1052-1053), which packages/config/turbo.json:12-32 does not hash. 'inputs' appears nowhere in MONOREPO_GUIDE.md. Confirmed lead: the lint task (turbo.json:50-58) has no dependsOn, while base.js:164-172 enables projectService typed rules (no-floating-promises, no-misused-promises, await-thenable). tsconfig.base.json:21-24 maps @repo/* to sibling source, so a dependency's type change leaves dependents' lint on a stale cache hit. typecheck already has ^typecheck (turbo.json:65-66).",
          "calibration": "Held at 8. The confirmed lint edge gap is the same class as #308 for typecheck. Fixing it is part of the band-9 condition, together with hashing eslint.config.mjs and documenting the inputs rule."
        },
        "3": {
          "score": 8,
          "evidence": "sweep runs-main: Release, Security, CodeQL, Docker Cache, Deep Checks and Runner Watchdog all succeed on 7766e29. sweep runs-ci-pr: PR runs 5-9 min. Two active rulesets. Not 9: Docker build inputs are matched by comment across four copies (ci-pr.yml:495-503, docker-cache.yml:69-80, security.yml:91-96, .github/actions/app-image/action.yml:54-64), and their cache rules differ (ci-pr.yml:502-503 vs docker-cache.yml:79-80). PNPM_VERSION 10.29.3 has seven copies, and no test compares the workflow and Dockerfile copies (ci-pr.yml:17, release.yml:28, security.yml:20, deep-checks.yml:16, Dockerfile.api:14, Dockerfile.web:8; scripts/doctor.test.mjs:29-31 checks only the local pnpm). Apps are hand-listed (scripts/ci-affected.mjs:6-9). Runner images are tag-pinned (tooling/ci-runners/cluster.yaml:97, scale-set.values.yaml:41)."
        },
        "4": {
          "score": 8,
          "evidence": "sweep coverage run 41677500043: 70.73/65.58/66.15/71.93 against floors 50/42/45/50 (vitest.coverage.config.ts:78-82). Per-package floors exist for auth, api and mobile-ui (:86-105). Exclusions carry reasons (:57-63). Tenancy contract sweeps apiTypeDefs (server.tenancy.test.ts:71-76,288-315). New: assistant.eval.fixture.test.ts:27-80 checks real tool state on PGlite. Not 9: floors trail measured by 21-24 points. The attachment e2e skips unless E2E_STORAGE_ENABLED is set, and no file under .github sets it (web-invitation-attachment.e2e.ts:91-94). Billing and sync have no package floor. The shard comment says 5 specs where there are 26 (ci-pr.yml:576)."
        },
        "5": {
          "score": 8,
          "evidence": "sweep audit exit 0 (4 low, 6 moderate). Not 9: the fast-uri@3 override is still ^3.1.6 (pnpm-workspace.yaml:186), while four Dependabot alerts (#140-#143) are fixed in 3.1.9. The minimatch ^10.2.3 override (:148) is below the 11.0.1 fix (alert #161). The coupled pins @simplewebauthn/server (:18) and wa-sqlite (:59, coupling comment :50) are missing from the npm ignore list (dependabot.yml:57-113), so PRs #828 and #829 are open. Cargo glib alert #1 has been open since 2026-07-27."
        },
        "6": {
          "score": 8,
          "evidence": "sweep runs-main: Release green on five consecutive main commits. Fork guards at release.yml:229,327. Still open (#847): per-app update-ref and push with no --atomic (.ai/release-apps.util.ts:246-249), and $GITHUB_OUTPUT written only after runReleaseApps returns (.ai/release-apps.ts:99-106). No test covers publish-images, deploy-images or app-image. Rulesets target only ~DEFAULT_BRANCH (.github/rulesets/main.json:8, main-owner.json:7). Tag and GitHub Release steps are inline bash (release.yml:165-178). turbo@2 is unpinned in Dockerfile.api:18 and Dockerfile.web:12. .changeset/ holds 36 pending changesets behind version PR #815, whose CI runs end action_required (sweep).",
          "calibration": "Held at 8 per the 11-02 note. Raise to 9 when #847 lands and the publish/deploy path has a test."
        },
        "7": {
          "score": 8,
          "evidence": "sweep: audit exit 0. Three open code-scanning alerts. #114 (CodeQL polynomial-redos) at tooling/desk/src/engine/worktree.bootstrap.ts:32 is a false positive: :31 collapses every non-[a-z0-9] run to one '-', the only caller passes an issue title (pipeline.stage.setup.ts:85), and :34 works on 40 characters at most. #114 is not dismissed. #98 and #99 have no recorded disposition, as SECURITY.md:87 requires. Strengths hold: billing webhook verifies the signature first (billing.webhook.ts:135-144), API-key scope is server-derived (server.ts:268-322), dependency-review fails on high (ci-pr.yml:168). Not 9: the PR image gate is CRITICAL-only (ci-pr.yml:535-542). CSP and HSTS (apps/web/nginx.conf:72,88) have no test. The api-key refusal test hand-lists five mutations (api-keys.tenancy.test.ts:331-350)."
        },
        "8": {
          "score": 8,
          "evidence": "doctor reads WEB_PORT/API_PORT from .env for per-worktree ports (scripts/doctor.mjs:111-121) and checks the RustFS ports (:115-116). bootstrap is at package.json:49 and worktree:env at :45. Not 9: the port-owner hint uses only lsof, with no win32 branch (doctor.mjs:224-226). No test parses .env.example against the env schema (the only reference is env.config.test.ts:86)."
        },
        "9": {
          "score": 8,
          "evidence": "sweep ai-doctor --strict exit 0 (31 skills, no drift). #848 fixes verified: MONOREPO_GUIDE.md:32-55 lists all 18 packages and 4 tooling workspaces, README.md:52,86 say eighteen, docs/README.md:29-51 indexes all 23 ADRs, no doc cites ADR 0016, ADR 0005 states p=5 and meets OWASP (:16,36), and .ai/serena-memories/project_overview.md:10-25 is current. Still open: environment_setup.md:12-35 lacks the billing/jobs/retention variables defined in .env.example:60,121-152. security.yml:38-40 and SECURITY.md:85 disagree on the audit-ignore location. ADR 0005:26 calls better-auth unused. No test derives the guide tree, readme count or ADR index from disk (monorepo-alignment.test.ts:568-575 reads workspaces only for tsconfig references).",
          "calibration": "6→8 per the 11-02 binding note (facts corrected, verified at commit). Not 9: no manifest-derived check stops a repeat of #848."
        },
        "10": {
          "score": 8,
          "evidence": "createAssistantTools exposes 9 tools (assistant.tools.ts:22-134). The 7 write tools are derived (assistant.eval.test.ts:26-27,65-83) and each has golden and schema cases (assistant.eval.data.ts:57-115,211-257). New fixture state contracts (assistant.eval.fixture.test.ts:27-80). Desk provider fallback is tested (provider.choose.test.ts:66-102; pipeline.runner.providers.test.ts:58-101), and so is AI regenerate (pipeline.runner.invariants.test.ts:262-302). The harness-eval --check gate runs on PRs (ci-pr.yml:269). Not 9: assistant.eval.ledger.json:3 is empty. No hash freshness check exists (assistant.eval.ledger.ts:92). The harness-eval ledger's latest run is still 2026-10-20 (docs/agents/harness-evals.md:883). The todo generator has no golden set (todos.ai-runtime.ts:88). probeProvider has no direct test (provider.probe.ts:36,67,100)."
        }
      },
      "findings": [
        {
          "slug": "release-push-non-atomic",
          "title": "release: release:apps pushes release branches one by one, so a failure can split the api and web pair",
          "dimension": 6,
          "ladderRank": 2,
          "disposition": "open",
          "issue": 847,
          "reason": "Folded into #847; .ai/release-apps.util.ts:246-249"
        },
        {
          "slug": "turbo-lint-hash-omits-dependency-types",
          "title": "build: turbo lint has no ^ edge while typed rules read dependency types",
          "dimension": 2,
          "ladderRank": 2,
          "disposition": "open",
          "reason": "Confirmed this run (turbo.json:50-58, base.js:164-172, tsconfig.base.json:21-24); proposed for filing",
          "issue": 864
        },
        {
          "slug": "trivy-api-uuid-decode-uri-untriaged",
          "title": "security: trivy #23 and #24 in the api image have no fix or recorded disposition",
          "dimension": 7,
          "ladderRank": 2,
          "disposition": "fixed",
          "reason": "Neither alert is open in sweep code-scanning"
        },
        {
          "slug": "server-only-regex-misses-billing-jobs",
          "title": "eslint: the server-only import block does not cover @repo/billing or @repo/jobs",
          "dimension": 1,
          "ladderRank": 3,
          "disposition": "open",
          "issue": 846,
          "reason": "Still present at base.js:14-15; #846 open"
        },
        {
          "slug": "release-apps-output-lost-on-partial-push",
          "title": "release: a failed release-branch push writes no deploy output, so the app that already moved never deploys",
          "dimension": 6,
          "ladderRank": 3,
          "disposition": "open",
          "issue": 847,
          "reason": "Still present at .ai/release-apps.ts:99-106; #847 open"
        },
        {
          "slug": "guide-workspace-tree-stale",
          "title": "docs: monorepo guide tree, readme package count, and adr index miss the packages and adrs added since october",
          "dimension": 9,
          "ladderRank": 3,
          "disposition": "fixed",
          "issue": 848,
          "reason": "MONOREPO_GUIDE.md:32-55 lists all workspaces"
        },
        {
          "slug": "readme-package-count-stale",
          "title": "docs: readme says thirteen shared packages, there are 18",
          "dimension": 9,
          "ladderRank": 3,
          "disposition": "fixed",
          "issue": 848,
          "reason": "README.md:52,86 say eighteen"
        },
        {
          "slug": "adr-0005-stale-cost-defaults",
          "title": "docs: adr 0005 body still states p=1 and a below-owasp default, contradicting its status line and the code",
          "dimension": 9,
          "ladderRank": 3,
          "disposition": "fixed",
          "reason": "docs/adr/0005-scrypt-password-hashing.md:16,36 corrected"
        },
        {
          "slug": "csp-hsts-headers-untested",
          "title": "security: csp and hsts headers exist only in the nginx template with no test",
          "dimension": 7,
          "ladderRank": 3,
          "disposition": "observed",
          "reason": "Band-9 gap; apps/web/nginx.conf:72,88"
        },
        {
          "slug": "eslint-contract-reads-unhashed-root-config",
          "title": "build: the eslint import-block contract reads root eslint.config.mjs, which the config test hash omits",
          "dimension": 2,
          "ladderRank": 3,
          "disposition": "observed",
          "reason": "Band-9 gap; monorepo-alignment.test.ts:1052-1053 vs packages/config/turbo.json:12-32"
        },
        {
          "slug": "adr-0016-dangling-reference",
          "title": "docs: adr 0017 cites adr 0016, which does not exist",
          "dimension": 9,
          "ladderRank": 4,
          "disposition": "fixed",
          "reason": "No doc cites 0016 any more"
        },
        {
          "slug": "adr-index-incomplete",
          "title": "docs: the adr index lists 13 of 19 adrs",
          "dimension": 9,
          "ladderRank": 4,
          "disposition": "fixed",
          "issue": 848,
          "reason": "docs/README.md:29-51 lists all 23"
        },
        {
          "slug": "test-presence-list-misses-new-packages",
          "title": "testing: the ship-a-test list omits billing, jobs, sync and ui-3d",
          "dimension": 1,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "All four ship tests today; no regression guard"
        },
        {
          "slug": "minimatch-override-pins-below-fixed-major",
          "title": "deps: the minimatch ^10.2.3 override holds the tree below the 11.0.1 fix",
          "dimension": 5,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Fix only in a new major; medium severity"
        },
        {
          "slug": "trivy-medium-alerts-no-recorded-disposition",
          "title": "security: trivy #98 and #99 have no recorded fix or disposition",
          "dimension": 7,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Still open; medium"
        },
        {
          "slug": "legacy-sha256-verify-no-sunset",
          "title": "auth: the unsalted sha256 verify fallback has no removal plan",
          "dimension": 7,
          "ladderRank": 4,
          "disposition": "fixed",
          "issue": 499,
          "reason": "Closed by #499"
        },
        {
          "slug": "docker-build-inputs-untested",
          "title": "ci: docker build inputs in ci-pr, docker-cache, security and app-image match by comment only",
          "dimension": 3,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Band-9 gap; cache rules also differ across the copies"
        },
        {
          "slug": "assistant-eval-ledger-empty",
          "title": "eval: the committed assistant eval ledger holds no reviewed live run",
          "dimension": 10,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Needs a paid live run by the owner"
        },
        {
          "slug": "serena-project-overview-stale",
          "title": "ai: the serena project overview omits passkey, magic link, api key and five packages",
          "dimension": 9,
          "ladderRank": 5,
          "disposition": "fixed",
          "reason": "project_overview.md:10-25 current"
        },
        {
          "slug": "image-publish-deploy-jobs-untested",
          "title": "release: the ghcr publish and deploy jobs and the app-image action have no test",
          "dimension": 6,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Band-9 condition"
        },
        {
          "slug": "release-branches-unprotected",
          "title": "release: rulesets cover only main, so a push to release/<app> deploys without the main gates",
          "dimension": 6,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Owner settings choice"
        },
        {
          "slug": "changeset-release-ci-action-required",
          "title": "ci: CI PR runs on changeset-release/main end action_required",
          "dimension": 3,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Five held runs in sweep; the cause needs the run actors"
        },
        {
          "slug": "billing-sync-no-per-package-coverage-floor",
          "title": "testing: billing and sync are measured only against the global floor",
          "dimension": 4,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Carried"
        },
        {
          "slug": "env-example-coverage-ungated",
          "title": "dx: no test checks that .env.example covers the api env schema",
          "dimension": 8,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Carried"
        },
        {
          "slug": "assistant-eval-prompt-drift-unrecorded",
          "title": "eval: no check requires a fresh ledger run when the prompt or dataset hash changes",
          "dimension": 10,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "assistant.eval.ledger.ts:92"
        },
        {
          "slug": "transitive-security-via-manual-overrides",
          "title": "deps: transitive security fixes rely on hand-kept override floors with no stale-floor check",
          "dimension": 5,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "fast-uri ^3.1.6 at pnpm-workspace.yaml:186 holds four alerts fixed in 3.1.9"
        },
        {
          "slug": "dependabot-security-updates-transitive-not-possible",
          "title": "deps: Dependabot security updates for transitive pnpm dependencies end security_update_not_possible",
          "dimension": 5,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Carried"
        },
        {
          "slug": "dependabot-majors-on-coupled-catalog-pins",
          "title": "deps: dependabot proposes majors for simplewebauthn and wa-sqlite that the catalog says must move with another package",
          "dimension": 5,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "#828, #829 open"
        },
        {
          "slug": "docker-pruner-turbo-unpinned",
          "title": "deploy: the docker pruner installs turbo@2 unpinned while the lockfile has 2.11.10",
          "dimension": 6,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Also in Dockerfile.web:12"
        },
        {
          "slug": "api-key-access-change-refusal-hand-listed",
          "title": "security: the api-key access-change refusal test names five mutations instead of sweeping the schema",
          "dimension": 7,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "api-keys.tenancy.test.ts:331-350"
        },
        {
          "slug": "todo-generation-eval-absent",
          "title": "eval: the todo generator has no golden set or ledger",
          "dimension": 10,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "todos.ai-runtime.ts:88"
        },
        {
          "slug": "serena-env-memory-incomplete",
          "title": "ai: the serena environment memory lists no billing, jobs, retention or split storage expiry variables",
          "dimension": 9,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "environment_setup.md:12-35 vs .env.example:60,121-152"
        },
        {
          "slug": "trivy-api-minimatch-glob-medium",
          "title": "security: trivy #98 and #99 (glob 13.0.5, minimatch 10.2.6) open in the api image",
          "dimension": 7,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Medium; fixes in new majors"
        },
        {
          "slug": "server-only-split-undocumented",
          "title": "docs: monorepo guide does not describe the client-safe versus server-only entry rule",
          "dimension": 1,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Carried"
        },
        {
          "slug": "inputs-rule-undocumented-in-guide",
          "title": "docs: monorepo guide does not explain the turbo test-inputs contract",
          "dimension": 2,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "No 'inputs' in MONOREPO_GUIDE.md"
        },
        {
          "slug": "invitation-attachment-e2e-skipped-in-ci",
          "title": "testing: the attachment e2e skips in ci without e2e_storage_enabled",
          "dimension": 4,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "web-invitation-attachment.e2e.ts:91-94"
        },
        {
          "slug": "desk-provider-probe-untested",
          "title": "desk: probeProvider, createProviderPort and versionAtLeast have no direct test",
          "dimension": 10,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "provider.probe.ts:36,67,100; engine tests inject the port"
        },
        {
          "slug": "codeql-desk-slugify-redos-alert-untriaged",
          "title": "security: codeql alert #114 on the desk slugify regex is open with no dismissal reason",
          "dimension": 7,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "False positive (worktree.bootstrap.ts:31 collapses dash runs); needs a dismissal, not code"
        },
        {
          "slug": "version-pr-runs-held-docs-stale",
          "title": "release: version pr ci runs wait for approval while docs say they never start",
          "dimension": 6,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "release.yml:155-159 and docs/release-checklist.md:60 still do not explain action_required"
        },
        {
          "slug": "cargo-glib-alert-open-since-july",
          "title": "deps: Cargo glib 0.18.5 Dependabot alert open since 2026-07-27",
          "dimension": 5,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "Dependabot #1 open"
        },
        {
          "slug": "dynamic-reads-self-registration",
          "title": "build: DYNAMIC_READS depends on authors registering git walks and subprocess tests",
          "dimension": 2,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "monorepo-alignment.test.ts:282-317"
        },
        {
          "slug": "trivy-pr-gate-critical-only",
          "title": "security: high image vulnerabilities do not fail pull requests",
          "dimension": 7,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "ci-pr.yml:535-542"
        },
        {
          "slug": "harness-eval-ledger-stale",
          "title": "eval: the harness-eval ledger has no run since 2026-10-20",
          "dimension": 10,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "docs/agents/harness-evals.md:883; runs need owner budget"
        },
        {
          "slug": "changeset-backlog-36-pending",
          "title": "release: 36 changesets wait behind version pr #815",
          "dimension": 6,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Owner merge decision"
        },
        {
          "slug": "ci-runner-images-tag-pinned",
          "title": "ci: self-hosted dind and buildkit images are tag-pinned outside dependabot",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "cluster.yaml:97, scale-set.values.yaml:41"
        },
        {
          "slug": "desk-opencode-skill-evidence-unrecorded",
          "title": "desk: no offline replay or skill-read fixture for the opencode provider",
          "dimension": 10,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Only opencode-error.jsonl exists"
        },
        {
          "slug": "web-rendered-tests-thin",
          "title": "testing: only two web components have rendered tests",
          "dimension": 4,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "Fixed on 11-02"
        },
        {
          "slug": "sbom-separate-pass",
          "title": "ci: the sbom step reanalyses the image instead of reusing the trivy cache",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "Fixed on 11-02"
        },
        {
          "slug": "audit-ignores-no-expiry",
          "title": "deps: audit ignores have issue links but no expiry",
          "dimension": 5,
          "ladderRank": 8,
          "disposition": "fixed",
          "reason": "No ignores remain"
        },
        {
          "slug": "pnpm-version-duplicated",
          "title": "ci: pnpm version is repeated in four workflows and two dockerfiles",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Seven copies, none tested"
        },
        {
          "slug": "tag-release-steps-untested",
          "title": "release: tag push and github release steps are inline bash without a test",
          "dimension": 6,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "release.yml:165-178"
        },
        {
          "slug": "coverage-floors-far-below-measured",
          "title": "testing: global floors trail measured coverage by 21-24 points",
          "dimension": 4,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "sweep coverage vs vitest.coverage.config.ts:78-82"
        },
        {
          "slug": "windows-desk-no-preflight",
          "title": "dx: no preflight warns windows users before pnpm check fails in @repo/desk",
          "dimension": 8,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "doctor.mjs:224-226 lsof only"
        },
        {
          "slug": "audit-ignore-doc-drift",
          "title": "docs: security.yml points at package.json auditConfig while SECURITY.md names pnpm-workspace.yaml",
          "dimension": 5,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "security.yml:38-40 vs SECURITY.md:85"
        },
        {
          "slug": "adr-0005-better-auth-unused-claim",
          "title": "docs: adr 0005 alternatives still call better-auth unused",
          "dimension": 9,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "Historical text at docs/adr/0005-scrypt-password-hashing.md:26"
        },
        {
          "slug": "guide-size-budget-unenforced",
          "title": "ai: the context audit reports guide size but enforces no ceiling",
          "dimension": 9,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "Carried"
        },
        {
          "slug": "workspace-tree-not-derived",
          "title": "docs: no test derives the guide workspace tree or readme package count from manifests",
          "dimension": 9,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "#848 added no check; band-9 condition"
        },
        {
          "slug": "dom-workspace-list-hand-maintained",
          "title": "lint: the dom workspace list in base.js and its contract test are both hand-kept",
          "dimension": 1,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "Carried"
        },
        {
          "slug": "e2e-shard-comment-stale",
          "title": "ci: the e2e shard comment says 5 spec files, there are 26",
          "dimension": 4,
          "ladderRank": 10,
          "disposition": "observed",
          "reason": "ci-pr.yml:576"
        }
      ]
    },
    {
      "date": "2026-11-09",
      "commit": "5babf89535a76bd6e4e74ad51e35bdfe381bcb3f",
      "mode": "fan-out",
      "agent": "claude",
      "overall": 7.9,
      "dimensions": {
        "1": {
          "score": 7,
          "evidence": "sweep: boundaries exit 0 (1555 files / 27 packages), knip exit 0. #846 still open at 5babf895: SERVER_ONLY_ENTRY_PATTERN (packages/config/eslint/base.js:19-20) covers storage/auth/db/email only, and the contract list (monorepo-alignment.test.ts:1022-1031) omits billing and jobs. New since 11-04: the context-boundary rule (#890) is scoped to feature files (api-boundaries.js:139-149) and checked by api-boundaries.test.js:130-139 and monorepo-alignment.test.ts:1145-1169. api-boundaries.js:5-6 still says eslint-plugin-import has no TypeScript resolver, but #891 added one (base.js:53-69). Test-presence list (:1176-1195) still omits billing, jobs, sync and ui-3d.",
          "calibration": "Held at 7 per the 11-02 binding note. The #846 fix is prepared in #921 (pattern + contract list, proven red without it); raise to 8 when it merges."
        },
        "2": {
          "score": 8,
          "evidence": "#870 closed #864: lint has dependsOn ^typecheck and hashes eslint.config.mjs (turbo.json:50-60), enforced at monorepo-alignment.test.ts:1274. Still open: packages/config/turbo.json:12-32 does not hash root eslint.config.mjs, which three contract tests load (monorepo-alignment.test.ts:1053,1109,1149); 'inputs' absent from MONOREPO_GUIDE.md. New: the inputs-vs-reads scan matches only .test.ts, .test.tsx and .test.mjs files (monorepo-alignment.test.ts:1445), so api-boundaries.test.js:158 reads CONTEXT.md unhashed.",
          "calibration": "Held at 8. One band-9 condition met (lint edge), one new gap of the same class found. Fix for both the .js scan and the eslint.config.mjs/CONTEXT.md inputs is prepared in #921; 9 still needs the inputs rule in the guide."
        },
        "3": {
          "score": 8,
          "evidence": "sweep runs-main: CodeQL, Security, Docker Cache green on 5babf895; PR runs 4.5-9 min; two active rulesets. pr-quality-gate.test.mjs:416-451 now checks docker-cache paths, the node --test list and BuildKit cache expressions. Not 9: Docker build inputs still match by comment across ci-pr.yml:523-531, docker-cache.yml:76-80, security.yml:91-96, app-image/action.yml:54-64; PNPM_VERSION has six untested copies (ci-pr.yml:17, release.yml:28, security.yml:20, deep-checks.yml:16, Dockerfile.api:14, Dockerfile.web:8); apps hand-listed (scripts/ci-affected.mjs:6-9); runner images tag-pinned."
        },
        "4": {
          "score": 8,
          "evidence": "Floors 50/42/45/50 (vitest.coverage.config.ts:78-82) vs last measured 70.73/65.58/66.15/71.93 (run 41677500043; no local summary). #915 added 5 visual baselines (web-visual-baseline.e2e.ts:72-108) that run only with the ci:run-visual label (ci-pr.yml:704-709). Release on 0ffad135 went red on a flake: server.events.test.ts:143-144 received a second 'build' issue-updated. Cause: store.write creates the folder before state.json (store.issue.ts:127-128), and the watcher counts the 'missing' read as a change (server.watch.ts:67-74). Attachment e2e still skips in CI (web-invitation-attachment.e2e.ts:91-94).",
          "calibration": "Held at 8. A flake on main is scored like the 09-09 red-gate precedent: mechanism works, one broken contract. Deterministic watcher test and fix prepared in #923."
        },
        "5": {
          "score": 8,
          "evidence": "sweep audit exit 0 (1 low). Four 11-04 gaps fixed: fast-uri ^3.1.9 (pnpm-workspace.yaml:197), minimatch ^11.0.1 with reason (:149-153), wa-sqlite and @simplewebauthn/server majors ignored (dependabot.yml:121-129, #872). Not 9: override floors are hand-kept with no stale-floor check (pnpm-workspace.yaml:185-213); Cargo has the updater (dependabot.yml:182-199) but no audit gate; glib alert #1 (medium, fix only in 0.20) open since 2026-07-27 with no recorded disposition."
        },
        "6": {
          "score": 8,
          "evidence": "#847 still open at 5babf895: per-app update-ref + push with no --atomic (.ai/release-apps.util.ts:246-249), output written after the loop (.ai/release-apps.ts:105-106). Release failed twice on main: 0ffad135 on the desk flake (dim 4) and 2dfa48ff at changesets/action ('Reference does not exist') after a hand merge of main into changeset-release/main mid-run; no doc warned against that (docs/release-checklist.md:59-60). deploy-images uses !cancelled() (release.yml:319-322), so no split release. 52 changesets pending behind #815. turbo@2 unpinned (Dockerfile.api:18, Dockerfile.web:12).",
          "calibration": "Held at 8 per the 11-02 note. Atomic push + rerun test prepared in #922 (red without the fix); 9 still needs a publish/deploy-path test."
        },
        "7": {
          "score": 8,
          "evidence": "Code scanning: 0 open alerts (was 3). #98/#99 fixed by minimatch ^11.0.1 and glob ^14.0.2 overrides (pnpm-workspace.yaml:153,156-157); #114 closed with a documented linear regex (worktree.bootstrap.ts:31-35). Dependabot: deepmerge #145 low (no patch), glib #1 medium. Dependency review fails on high (ci-pr.yml:168). Not 9: the PR Trivy gate is CRITICAL-only (ci-pr.yml:563-570); CSP/HSTS (apps/web/nginx.conf:72,88) untested; api-key refusal test hand-lists five mutations (api-keys.tenancy.test.ts:328-350)."
        },
        "8": {
          "score": 8,
          "evidence": "Every AGENTS.md Common Command resolves in package.json (check:affected :19, smoke :28, smoke:desktop :30, bootstrap :49, graph* :60-62, desk:run :70, docs:for :80, review:pre :81, public-text:* :82-83). New t3.json:6 setup reuses runWorktreeEnv (scripts/t3-worktree-setup.mjs:15,72-73), tested in the CI node list (ci-pr.yml:301). .env.example covers the API env schema by hand (apps/api/src/env.config.ts:17-127). Not 9: lsof-only port hint (doctor.mjs:224-234), no .env.example-vs-schema test, no documented-commands test."
        },
        "9": {
          "score": 8,
          "evidence": "sweep ai:doctor --strict exit 0 (40 kaine skills, AGENTS.md index matches, incl. coupling-audit/document-release/qa/security-audit at :295,:300,:311,:317). #848 facts still hold; ADR 0025 indexed by hand (docs/README.md:29-52). Still open: environment_setup.md:12-35 lacks billing/jobs/retention/AI vars; security.yml:38-40 names package.json ignoreCves while SECURITY.md:85 names pnpm-workspace ignoreGhsas; ADR 0005:27 calls better-auth unused. No test derives the guide tree, readme count or ADR index from disk.",
          "calibration": "Held at 8 per the 11-04 note. Env memory drift fixed in this run's ledger PR and audit-ignore drift in #931; 9 still needs a manifest-derived check."
        },
        "10": {
          "score": 8,
          "evidence": "createAssistantTools exposes 9 tools (assistant.tools.ts:24-133), each with a golden case (assistant.eval.data.ts:57-115); write tools derived (assistant.eval.test.ts:26-27,65-83). harness-eval --check gates PRs via ai:test (ci-pr.yml:297, package.json:58). Narrowed: probeProvider/versionAtLeast covered through runDoctor (doctor.checks.test.ts:379-419); six OpenCode replay fixtures. New: the eight #889 specialist prompts have no snapshot and specialistPrompt's brief target and fenced() guard are untested (jobs.specialist.ts:11-15,41-83). Not 9: assistant.eval.ledger.json:3 empty; harness-eval latest run 2026-10-20 (harness-evals.md:883)."
        }
      },
      "findings": [
        {
          "slug": "desk-store-watcher-duplicate-event-flake",
          "title": "desk: the store watcher reports a half-written issue, so one new issue sends two events and Release flakes",
          "dimension": 4,
          "ladderRank": 1,
          "disposition": "observed",
          "reason": "Turned Release red on 0ffad135 (server.events.test.ts:143-144). Not filed: fix and a deterministic watcher test (server.watch.test.ts) prepared in #923"
        },
        {
          "slug": "inputs-check-skips-js-tests",
          "title": "build: the inputs-versus-reads check skips .test.js files, so the CONTEXT.md read is unhashed",
          "dimension": 2,
          "ladderRank": 2,
          "disposition": "observed",
          "reason": "monorepo-alignment.test.ts:1445 vs api-boundaries.test.js:158. Not filed: scan widened and inputs added in #921"
        },
        {
          "slug": "version-pr-branch-hand-update-unwarned",
          "title": "release: no doc warns against updating changeset-release/main by hand, which fails the Release changesets step",
          "dimension": 6,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Release 2dfa48ff failed after a hand merge. Not filed: warning added to docs/release-checklist.md in #922"
        },
        {
          "slug": "api-boundaries-stale-resolver-comment",
          "title": "lint: the context-boundary rule comment says eslint-plugin-import has no TypeScript resolver",
          "dimension": 1,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "api-boundaries.js:5-6 vs base.js:53-69 (#891). Comment corrected in #921"
        },
        {
          "slug": "visual-regression-label-gated",
          "title": "testing: visual baselines run only on PRs with the ci:run-visual label",
          "dimension": 4,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Deliberate cost choice (ci-pr.yml:704-709); band-9 gap"
        },
        {
          "slug": "desk-specialist-prompts-untested",
          "title": "desk: the eight specialist prompts have no snapshot and the brief target and fenced() guard are untested",
          "dimension": 10,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "jobs.specialist.ts:11-15,41-83; band-9 gap"
        },
        {
          "slug": "assistant-listnotes-schema-case-absent",
          "title": "eval: listNotes has no schema case while listTodos has one for the same bound",
          "dimension": 10,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "assistant.tools.ts:105 vs assistant.eval.data.ts:262-267; minor"
        },
        {
          "slug": "documented-commands-ungated",
          "title": "dx: no test checks that the commands AGENTS.md names exist in package.json",
          "dimension": 8,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "All resolve today; band-9 gap"
        },
        {
          "slug": "release-push-non-atomic",
          "title": "release: release:apps pushes release branches one by one, so a failure can split the api and web pair",
          "dimension": 6,
          "ladderRank": 2,
          "disposition": "open",
          "issue": 847,
          "reason": "Atomic push prepared in #922; #847 stays open until it merges"
        },
        {
          "slug": "turbo-lint-hash-omits-dependency-types",
          "title": "build: turbo lint has no ^ edge while typed rules read dependency types",
          "dimension": 2,
          "ladderRank": 2,
          "disposition": "fixed",
          "reason": "Closed by #870: lint dependsOn ^typecheck (turbo.json:50-60), test at monorepo-alignment.test.ts:1274",
          "issue": 864
        },
        {
          "slug": "server-only-regex-misses-billing-jobs",
          "title": "eslint: the server-only import block does not cover @repo/billing or @repo/jobs",
          "dimension": 1,
          "ladderRank": 3,
          "disposition": "open",
          "issue": 846,
          "reason": "Fix prepared in #921; #846 stays open until it merges"
        },
        {
          "slug": "release-apps-output-lost-on-partial-push",
          "title": "release: a failed release-branch push writes no deploy output, so the app that already moved never deploys",
          "dimension": 6,
          "ladderRank": 3,
          "disposition": "open",
          "issue": 847,
          "reason": "With one atomic push nothing moves on failure, so the rerun deploys the pair (new spec case); #847"
        },
        {
          "slug": "csp-hsts-headers-untested",
          "title": "security: csp and hsts headers exist only in the nginx template with no test",
          "dimension": 7,
          "ladderRank": 3,
          "disposition": "observed",
          "reason": "Band-9 gap; apps/web/nginx.conf:72,88"
        },
        {
          "slug": "eslint-contract-reads-unhashed-root-config",
          "title": "build: the eslint import-block contract reads root eslint.config.mjs, which the config test hash omits",
          "dimension": 2,
          "ladderRank": 3,
          "disposition": "observed",
          "reason": "eslint.config.mjs added to packages/config/turbo.json test inputs in #921"
        },
        {
          "slug": "test-presence-list-misses-new-packages",
          "title": "testing: the ship-a-test list omits billing, jobs, sync and ui-3d",
          "dimension": 1,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "All four ship tests today; no regression guard"
        },
        {
          "slug": "minimatch-override-pins-below-fixed-major",
          "title": "deps: the minimatch ^10.2.3 override holds the tree below the 11.0.1 fix",
          "dimension": 5,
          "ladderRank": 4,
          "disposition": "fixed",
          "reason": "minimatch ^11.0.1 (pnpm-workspace.yaml:149-153)"
        },
        {
          "slug": "trivy-medium-alerts-no-recorded-disposition",
          "title": "security: trivy #98 and #99 have no recorded fix or disposition",
          "dimension": 7,
          "ladderRank": 4,
          "disposition": "fixed",
          "reason": "#98/#99 closed by overrides (pnpm-workspace.yaml:153,156-157)"
        },
        {
          "slug": "docker-build-inputs-untested",
          "title": "ci: docker build inputs in ci-pr, docker-cache, security and app-image match by comment only",
          "dimension": 3,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Band-9 gap; cache rules also differ across the copies"
        },
        {
          "slug": "assistant-eval-ledger-empty",
          "title": "eval: the committed assistant eval ledger holds no reviewed live run",
          "dimension": 10,
          "ladderRank": 4,
          "disposition": "observed",
          "reason": "Needs a paid live run by the owner"
        },
        {
          "slug": "image-publish-deploy-jobs-untested",
          "title": "release: the ghcr publish and deploy jobs and the app-image action have no test",
          "dimension": 6,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Band-9 condition"
        },
        {
          "slug": "release-branches-unprotected",
          "title": "release: rulesets cover only main, so a push to release/<app> deploys without the main gates",
          "dimension": 6,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Owner settings choice"
        },
        {
          "slug": "changeset-release-ci-action-required",
          "title": "ci: CI PR runs on changeset-release/main end action_required",
          "dimension": 3,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Cause recorded on 11-02: repo-setup.json:20 fork_pr_contributor_approval holds the version-PR runs; the fix is an owner settings or token choice"
        },
        {
          "slug": "billing-sync-no-per-package-coverage-floor",
          "title": "testing: billing and sync are measured only against the global floor",
          "dimension": 4,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Carried"
        },
        {
          "slug": "env-example-coverage-ungated",
          "title": "dx: no test checks that .env.example covers the api env schema",
          "dimension": 8,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Carried"
        },
        {
          "slug": "assistant-eval-prompt-drift-unrecorded",
          "title": "eval: no check requires a fresh ledger run when the prompt or dataset hash changes",
          "dimension": 10,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "assistant.eval.ledger.ts:92"
        },
        {
          "slug": "transitive-security-via-manual-overrides",
          "title": "deps: transitive security fixes rely on hand-kept override floors with no stale-floor check",
          "dimension": 5,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "The fast-uri floor is now ^3.1.9 (pnpm-workspace.yaml:197), but at 5babf89 no check catches a stale or ineffective override floor; #931 adds that test"
        },
        {
          "slug": "dependabot-security-updates-transitive-not-possible",
          "title": "deps: Dependabot security updates for transitive pnpm dependencies end security_update_not_possible",
          "dimension": 5,
          "ladderRank": 5,
          "disposition": "observed",
          "reason": "Carried"
        },
        {
          "slug": "dependabot-majors-on-coupled-catalog-pins",
          "title": "deps: dependabot proposes majors for simplewebauthn and wa-sqlite that the catalog says must move with another package",
          "dimension": 5,
          "ladderRank": 6,
          "disposition": "fixed",
          "reason": "Ignored with coupling reasons (dependabot.yml:121-129, #872)"
        },
        {
          "slug": "docker-pruner-turbo-unpinned",
          "title": "deploy: the docker pruner installs turbo@2 unpinned while the lockfile has 2.11.10",
          "dimension": 6,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Also in Dockerfile.web:12"
        },
        {
          "slug": "api-key-access-change-refusal-hand-listed",
          "title": "security: the api-key access-change refusal test names five mutations instead of sweeping the schema",
          "dimension": 7,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "api-keys.tenancy.test.ts:331-350"
        },
        {
          "slug": "todo-generation-eval-absent",
          "title": "eval: the todo generator has no golden set or ledger",
          "dimension": 10,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "todos.ai-runtime.ts:88"
        },
        {
          "slug": "serena-env-memory-incomplete",
          "title": "ai: the serena environment memory lists no billing, jobs, retention or split storage expiry variables",
          "dimension": 9,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Fixed in this run's ledger PR"
        },
        {
          "slug": "trivy-api-minimatch-glob-medium",
          "title": "security: trivy #98 and #99 (glob 13.0.5, minimatch 10.2.6) open in the api image",
          "dimension": 7,
          "ladderRank": 6,
          "disposition": "fixed",
          "reason": "#98/#99 closed by overrides"
        },
        {
          "slug": "server-only-split-undocumented",
          "title": "docs: monorepo guide does not describe the client-safe versus server-only entry rule",
          "dimension": 1,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "Carried"
        },
        {
          "slug": "inputs-rule-undocumented-in-guide",
          "title": "docs: monorepo guide does not explain the turbo test-inputs contract",
          "dimension": 2,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "No 'inputs' in MONOREPO_GUIDE.md"
        },
        {
          "slug": "invitation-attachment-e2e-skipped-in-ci",
          "title": "testing: the attachment e2e skips in ci without e2e_storage_enabled",
          "dimension": 4,
          "ladderRank": 6,
          "disposition": "observed",
          "reason": "web-invitation-attachment.e2e.ts:91-94"
        },
        {
          "slug": "desk-provider-probe-untested",
          "title": "desk: probeProvider, createProviderPort and versionAtLeast have no direct test",
          "dimension": 10,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "provider.probe.ts:36,67,100; engine tests inject the port"
        },
        {
          "slug": "codeql-desk-slugify-redos-alert-untriaged",
          "title": "security: codeql alert #114 on the desk slugify regex is open with no dismissal reason",
          "dimension": 7,
          "ladderRank": 7,
          "disposition": "fixed",
          "reason": "#114 closed (#917); worktree.bootstrap.ts:31-35"
        },
        {
          "slug": "version-pr-runs-held-docs-stale",
          "title": "release: version pr ci runs wait for approval while docs say they never start",
          "dimension": 6,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "release.yml:155-159 and docs/release-checklist.md:60 still do not explain action_required"
        },
        {
          "slug": "cargo-glib-alert-open-since-july",
          "title": "deps: Cargo glib 0.18.5 Dependabot alert open since 2026-07-27",
          "dimension": 5,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "Dependabot #1 open"
        },
        {
          "slug": "dynamic-reads-self-registration",
          "title": "build: DYNAMIC_READS depends on authors registering git walks and subprocess tests",
          "dimension": 2,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "monorepo-alignment.test.ts:282-317"
        },
        {
          "slug": "trivy-pr-gate-critical-only",
          "title": "security: high image vulnerabilities do not fail pull requests",
          "dimension": 7,
          "ladderRank": 7,
          "disposition": "observed",
          "reason": "ci-pr.yml:563-570 fails only on CRITICAL; #932 raises it to fixable HIGH"
        },
        {
          "slug": "harness-eval-ledger-stale",
          "title": "eval: the harness-eval ledger has no run since 2026-10-20",
          "dimension": 10,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "docs/agents/harness-evals.md:883; runs need owner budget"
        },
        {
          "slug": "changeset-backlog-36-pending",
          "title": "release: 52 changesets wait behind version pr #815",
          "dimension": 6,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Now 52 changesets wait behind version PR #815; owner merge decision"
        },
        {
          "slug": "ci-runner-images-tag-pinned",
          "title": "ci: self-hosted dind and buildkit images are tag-pinned outside dependabot",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "cluster.yaml:97, scale-set.values.yaml:41"
        },
        {
          "slug": "desk-opencode-skill-evidence-unrecorded",
          "title": "desk: no fixture shows the opencode provider reading a skill",
          "dimension": 10,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Six OpenCode replay fixtures exist (opencode.stream.test.ts:11-93, opencode.runner.test.ts:92-160); none records a skill read, unlike codex-skill-read.jsonl and claude-skill-invoked.jsonl"
        },
        {
          "slug": "pnpm-version-duplicated",
          "title": "ci: pnpm version is repeated in four workflows and two dockerfiles",
          "dimension": 3,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "Six workflow and Dockerfile copies of the package.json packageManager version, none tested; #925 adds the test"
        },
        {
          "slug": "tag-release-steps-untested",
          "title": "release: tag push and github release steps are inline bash without a test",
          "dimension": 6,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "release.yml:165-178"
        },
        {
          "slug": "coverage-floors-far-below-measured",
          "title": "testing: global floors trail measured coverage by 21-24 points",
          "dimension": 4,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "sweep coverage vs vitest.coverage.config.ts:78-82"
        },
        {
          "slug": "windows-desk-no-preflight",
          "title": "dx: no preflight warns windows users before pnpm check fails in @repo/desk",
          "dimension": 8,
          "ladderRank": 8,
          "disposition": "observed",
          "reason": "doctor.mjs:224-226 lsof only"
        },
        {
          "slug": "audit-ignore-doc-drift",
          "title": "docs: security.yml points at package.json auditConfig while SECURITY.md names pnpm-workspace.yaml",
          "dimension": 5,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "security.yml comment aligned with SECURITY.md in #931"
        },
        {
          "slug": "adr-0005-better-auth-unused-claim",
          "title": "docs: adr 0005 alternatives still call better-auth unused",
          "dimension": 9,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "Historical text at docs/adr/0005-scrypt-password-hashing.md:26"
        },
        {
          "slug": "guide-size-budget-unenforced",
          "title": "ai: the context audit reports guide size but enforces no ceiling",
          "dimension": 9,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "Carried"
        },
        {
          "slug": "workspace-tree-not-derived",
          "title": "docs: no test derives the guide workspace tree or readme package count from manifests",
          "dimension": 9,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "#848 added no check; band-9 condition"
        },
        {
          "slug": "dom-workspace-list-hand-maintained",
          "title": "lint: the dom workspace list in base.js and its contract test are both hand-kept",
          "dimension": 1,
          "ladderRank": 9,
          "disposition": "observed",
          "reason": "Carried"
        },
        {
          "slug": "e2e-shard-comment-stale",
          "title": "ci: the e2e shard comment says 5 spec files, there are 26",
          "dimension": 4,
          "ladderRank": 10,
          "disposition": "observed",
          "reason": "Stale count removed from ci-pr.yml in this run's ledger PR"
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

| Date       | Commit    | Mode       | Agent    | Overall | Dims | Findings filed |
| ---------- | --------- | ---------- | -------- | ------- | ---- | -------------- |
| 2026-11-09 | `5babf89` | fan-out    | claude   | **7.9** | 10   | 4              |
| 2026-11-04 | `7766e29` | fan-out    | desk-job | **7.9** | 10   | 8              |
| 2026-11-02 | `87b8219` | fan-out    | desk-job | **7.7** | 10   | 1              |
| 2026-10-20 | `9cf8364` | fan-out    | claude   | **8**   | 10   | 7              |
| 2026-10-18 | `c794e07` | fan-out    | claude   | **7.6** | 10   | 11             |
| 2026-09-10 | `cd623ee` | fan-out    | claude   | **7.8** | 9    | 14             |
| 2026-09-09 | `7e867a9` | fan-out    | claude   | **7.7** | 9    | 4              |
| 2026-09-09 | `c4189a5` | sequential | claude   | **7.4** | 9    | 9              |
| 2026-09-08 | `5f6f91f` | sequential | claude   | **7**   | 9    | 6              |
| 2026-08-21 | `aef4493` | sequential | opencode | **7.4** | 9    | 2              |
| 2026-08-21 | `4cbdfeb` | sequential | opencode | **7.3** | 9    | 2              |
| 2026-07-28 | `15102fc` | sequential | grok     | **7.3** | 9    | 2              |

### Latest scorecard — 2026-11-09 (`5babf89`, fan-out)

| #   | Dimension                | Score |              | Δ   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------ | ----- | ------------ | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Workspace & Boundaries   | 7.0   | `███████░░░` | 0   | sweep: boundaries exit 0 (1555 files / 27 packages), knip exit 0. #846 still open at 5babf895: SERVER_ONLY_ENTRY_PATTERN (packages/config/eslint/base.js:19-20) covers storage/auth/db/email only, and the contract list (monorepo-alignment.test.ts:1022-1031) omits billing and jobs. New since 11-04: the context-boundary rule (#890) is scoped to feature files (api-boundaries.js:139-149) and checked by api-boundaries.test.js:130-139 and monorepo-alignment.test.ts:1145-1169. api-boundaries.js:5-6 still says eslint-plugin-import has no TypeScript resolver, but #891 added one (base.js:53-69). Test-presence list (:1176-1195) still omits billing, jobs, sync and ui-3d. |
| 2   | Build & Cache            | 8.0   | `████████░░` | 0   | #870 closed #864: lint has dependsOn ^typecheck and hashes eslint.config.mjs (turbo.json:50-60), enforced at monorepo-alignment.test.ts:1274. Still open: packages/config/turbo.json:12-32 does not hash root eslint.config.mjs, which three contract tests load (monorepo-alignment.test.ts:1053,1109,1149); 'inputs' absent from MONOREPO_GUIDE.md. New: the inputs-vs-reads scan matches only .test.ts, .test.tsx and .test.mjs files (monorepo-alignment.test.ts:1445), so api-boundaries.test.js:158 reads CONTEXT.md unhashed.                                                                                                                                                      |
| 3   | CI Topology & Speed      | 8.0   | `████████░░` | 0   | sweep runs-main: CodeQL, Security, Docker Cache green on 5babf895; PR runs 4.5-9 min; two active rulesets. pr-quality-gate.test.mjs:416-451 now checks docker-cache paths, the node --test list and BuildKit cache expressions. Not 9: Docker build inputs still match by comment across ci-pr.yml:523-531, docker-cache.yml:76-80, security.yml:91-96, app-image/action.yml:54-64; PNPM_VERSION has six untested copies (ci-pr.yml:17, release.yml:28, security.yml:20, deep-checks.yml:16, Dockerfile.api:14, Dockerfile.web:8); apps hand-listed (scripts/ci-affected.mjs:6-9); runner images tag-pinned.                                                                              |
| 4   | Testing & Coverage       | 8.0   | `████████░░` | 0   | Floors 50/42/45/50 (vitest.coverage.config.ts:78-82) vs last measured 70.73/65.58/66.15/71.93 (run 41677500043; no local summary). #915 added 5 visual baselines (web-visual-baseline.e2e.ts:72-108) that run only with the ci:run-visual label (ci-pr.yml:704-709). Release on 0ffad135 went red on a flake: server.events.test.ts:143-144 received a second 'build' issue-updated. Cause: store.write creates the folder before state.json (store.issue.ts:127-128), and the watcher counts the 'missing' read as a change (server.watch.ts:67-74). Attachment e2e still skips in CI (web-invitation-attachment.e2e.ts:91-94).                                                          |
| 5   | Dependency Hygiene       | 8.0   | `████████░░` | 0   | sweep audit exit 0 (1 low). Four 11-04 gaps fixed: fast-uri ^3.1.9 (pnpm-workspace.yaml:197), minimatch ^11.0.1 with reason (:149-153), wa-sqlite and @simplewebauthn/server majors ignored (dependabot.yml:121-129, #872). Not 9: override floors are hand-kept with no stale-floor check (pnpm-workspace.yaml:185-213); Cargo has the updater (dependabot.yml:182-199) but no audit gate; glib alert #1 (medium, fix only in 0.20) open since 2026-07-27 with no recorded disposition.                                                                                                                                                                                                  |
| 6   | Release & Deploy         | 8.0   | `████████░░` | 0   | #847 still open at 5babf895: per-app update-ref + push with no --atomic (.ai/release-apps.util.ts:246-249), output written after the loop (.ai/release-apps.ts:105-106). Release failed twice on main: 0ffad135 on the desk flake (dim 4) and 2dfa48ff at changesets/action ('Reference does not exist') after a hand merge of main into changeset-release/main mid-run; no doc warned against that (docs/release-checklist.md:59-60). deploy-images uses !cancelled() (release.yml:319-322), so no split release. 52 changesets pending behind #815. turbo@2 unpinned (Dockerfile.api:18, Dockerfile.web:12).                                                                            |
| 7   | Security Posture         | 8.0   | `████████░░` | 0   | Code scanning: 0 open alerts (was 3). #98/#99 fixed by minimatch ^11.0.1 and glob ^14.0.2 overrides (pnpm-workspace.yaml:153,156-157); #114 closed with a documented linear regex (worktree.bootstrap.ts:31-35). Dependabot: deepmerge #145 low (no patch), glib #1 medium. Dependency review fails on high (ci-pr.yml:168). Not 9: the PR Trivy gate is CRITICAL-only (ci-pr.yml:563-570); CSP/HSTS (apps/web/nginx.conf:72,88) untested; api-key refusal test hand-lists five mutations (api-keys.tenancy.test.ts:328-350).                                                                                                                                                             |
| 8   | DX & Onboarding          | 8.0   | `████████░░` | 0   | Every AGENTS.md Common Command resolves in package.json (check:affected :19, smoke :28, smoke:desktop :30, bootstrap :49, graph* :60-62, desk:run :70, docs:for :80, review:pre :81, public-text:* :82-83). New t3.json:6 setup reuses runWorktreeEnv (scripts/t3-worktree-setup.mjs:15,72-73), tested in the CI node list (ci-pr.yml:301). .env.example covers the API env schema by hand (apps/api/src/env.config.ts:17-127). Not 9: lsof-only port hint (doctor.mjs:224-234), no .env.example-vs-schema test, no documented-commands test.                                                                                                                                             |
| 9   | Docs & Agent Scaffolding | 8.0   | `████████░░` | 0   | sweep ai:doctor --strict exit 0 (40 kaine skills, AGENTS.md index matches, incl. coupling-audit/document-release/qa/security-audit at :295,:300,:311,:317). #848 facts still hold; ADR 0025 indexed by hand (docs/README.md:29-52). Still open: environment_setup.md:12-35 lacks billing/jobs/retention/AI vars; security.yml:38-40 names package.json ignoreCves while SECURITY.md:85 names pnpm-workspace ignoreGhsas; ADR 0005:27 calls better-auth unused. No test derives the guide tree, readme count or ADR index from disk.                                                                                                                                                       |
| 10  | AI & Agent Quality       | 8.0   | `████████░░` | 0   | createAssistantTools exposes 9 tools (assistant.tools.ts:24-133), each with a golden case (assistant.eval.data.ts:57-115); write tools derived (assistant.eval.test.ts:26-27,65-83). harness-eval --check gates PRs via ai:test (ci-pr.yml:297, package.json:58). Narrowed: probeProvider/versionAtLeast covered through runDoctor (doctor.checks.test.ts:379-419); six OpenCode replay fixtures. New: the eight #889 specialist prompts have no snapshot and specialistPrompt's brief target and fenced() guard are untested (jobs.specialist.ts:11-15,41-83). Not 9: assistant.eval.ledger.json:3 empty; harness-eval latest run 2026-10-20 (harness-evals.md:883).                     |

**Overall: 7.9** (0)

### Findings

| Slug                                                  | Dimension | Ladder | Disposition | Issue | Title                                                                                                                  |
| ----------------------------------------------------- | --------- | ------ | ----------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| `desk-store-watcher-duplicate-event-flake`            | 4         | 1      | observed    | —     | desk: the store watcher reports a half-written issue, so one new issue sends two events and Release flakes             |
| `inputs-check-skips-js-tests`                         | 2         | 2      | observed    | —     | build: the inputs-versus-reads check skips .test.js files, so the CONTEXT.md read is unhashed                          |
| `release-push-non-atomic`                             | 6         | 2      | open        | #847  | release: release:apps pushes release branches one by one, so a failure can split the api and web pair                  |
| `turbo-lint-hash-omits-dependency-types`              | 2         | 2      | fixed       | #864  | build: turbo lint has no ^ edge while typed rules read dependency types                                                |
| `server-only-regex-misses-billing-jobs`               | 1         | 3      | open        | #846  | eslint: the server-only import block does not cover @repo/billing or @repo/jobs                                        |
| `release-apps-output-lost-on-partial-push`            | 6         | 3      | open        | #847  | release: a failed release-branch push writes no deploy output, so the app that already moved never deploys             |
| `csp-hsts-headers-untested`                           | 7         | 3      | observed    | —     | security: csp and hsts headers exist only in the nginx template with no test                                           |
| `eslint-contract-reads-unhashed-root-config`          | 2         | 3      | observed    | —     | build: the eslint import-block contract reads root eslint.config.mjs, which the config test hash omits                 |
| `version-pr-branch-hand-update-unwarned`              | 6         | 4      | observed    | —     | release: no doc warns against updating changeset-release/main by hand, which fails the Release changesets step         |
| `test-presence-list-misses-new-packages`              | 1         | 4      | observed    | —     | testing: the ship-a-test list omits billing, jobs, sync and ui-3d                                                      |
| `minimatch-override-pins-below-fixed-major`           | 5         | 4      | fixed       | —     | deps: the minimatch ^10.2.3 override holds the tree below the 11.0.1 fix                                               |
| `trivy-medium-alerts-no-recorded-disposition`         | 7         | 4      | fixed       | —     | security: trivy #98 and #99 have no recorded fix or disposition                                                        |
| `docker-build-inputs-untested`                        | 3         | 4      | observed    | —     | ci: docker build inputs in ci-pr, docker-cache, security and app-image match by comment only                           |
| `assistant-eval-ledger-empty`                         | 10        | 4      | observed    | —     | eval: the committed assistant eval ledger holds no reviewed live run                                                   |
| `desk-specialist-prompts-untested`                    | 10        | 5      | observed    | —     | desk: the eight specialist prompts have no snapshot and the brief target and fenced() guard are untested               |
| `image-publish-deploy-jobs-untested`                  | 6         | 5      | observed    | —     | release: the ghcr publish and deploy jobs and the app-image action have no test                                        |
| `release-branches-unprotected`                        | 6         | 5      | observed    | —     | release: rulesets cover only main, so a push to release/<app> deploys without the main gates                           |
| `changeset-release-ci-action-required`                | 3         | 5      | observed    | —     | ci: CI PR runs on changeset-release/main end action_required                                                           |
| `billing-sync-no-per-package-coverage-floor`          | 4         | 5      | observed    | —     | testing: billing and sync are measured only against the global floor                                                   |
| `env-example-coverage-ungated`                        | 8         | 5      | observed    | —     | dx: no test checks that .env.example covers the api env schema                                                         |
| `assistant-eval-prompt-drift-unrecorded`              | 10        | 5      | observed    | —     | eval: no check requires a fresh ledger run when the prompt or dataset hash changes                                     |
| `transitive-security-via-manual-overrides`            | 5         | 5      | observed    | —     | deps: transitive security fixes rely on hand-kept override floors with no stale-floor check                            |
| `dependabot-security-updates-transitive-not-possible` | 5         | 5      | observed    | —     | deps: Dependabot security updates for transitive pnpm dependencies end security_update_not_possible                    |
| `visual-regression-label-gated`                       | 4         | 6      | observed    | —     | testing: visual baselines run only on PRs with the ci:run-visual label                                                 |
| `dependabot-majors-on-coupled-catalog-pins`           | 5         | 6      | fixed       | —     | deps: dependabot proposes majors for simplewebauthn and wa-sqlite that the catalog says must move with another package |
| `docker-pruner-turbo-unpinned`                        | 6         | 6      | observed    | —     | deploy: the docker pruner installs turbo@2 unpinned while the lockfile has 2.11.10                                     |
| `api-key-access-change-refusal-hand-listed`           | 7         | 6      | observed    | —     | security: the api-key access-change refusal test names five mutations instead of sweeping the schema                   |
| `todo-generation-eval-absent`                         | 10        | 6      | observed    | —     | eval: the todo generator has no golden set or ledger                                                                   |
| `serena-env-memory-incomplete`                        | 9         | 6      | observed    | —     | ai: the serena environment memory lists no billing, jobs, retention or split storage expiry variables                  |
| `trivy-api-minimatch-glob-medium`                     | 7         | 6      | fixed       | —     | security: trivy #98 and #99 (glob 13.0.5, minimatch 10.2.6) open in the api image                                      |
| `server-only-split-undocumented`                      | 1         | 6      | observed    | —     | docs: monorepo guide does not describe the client-safe versus server-only entry rule                                   |
| `inputs-rule-undocumented-in-guide`                   | 2         | 6      | observed    | —     | docs: monorepo guide does not explain the turbo test-inputs contract                                                   |
| `invitation-attachment-e2e-skipped-in-ci`             | 4         | 6      | observed    | —     | testing: the attachment e2e skips in ci without e2e_storage_enabled                                                    |
| `assistant-listnotes-schema-case-absent`              | 10        | 7      | observed    | —     | eval: listNotes has no schema case while listTodos has one for the same bound                                          |
| `documented-commands-ungated`                         | 8         | 7      | observed    | —     | dx: no test checks that the commands AGENTS.md names exist in package.json                                             |
| `desk-provider-probe-untested`                        | 10        | 7      | observed    | —     | desk: probeProvider, createProviderPort and versionAtLeast have no direct test                                         |
| `codeql-desk-slugify-redos-alert-untriaged`           | 7         | 7      | fixed       | —     | security: codeql alert #114 on the desk slugify regex is open with no dismissal reason                                 |
| `version-pr-runs-held-docs-stale`                     | 6         | 7      | observed    | —     | release: version pr ci runs wait for approval while docs say they never start                                          |
| `cargo-glib-alert-open-since-july`                    | 5         | 7      | observed    | —     | deps: Cargo glib 0.18.5 Dependabot alert open since 2026-07-27                                                         |
| `dynamic-reads-self-registration`                     | 2         | 7      | observed    | —     | build: DYNAMIC_READS depends on authors registering git walks and subprocess tests                                     |
| `trivy-pr-gate-critical-only`                         | 7         | 7      | observed    | —     | security: high image vulnerabilities do not fail pull requests                                                         |
| `api-boundaries-stale-resolver-comment`               | 1         | 8      | observed    | —     | lint: the context-boundary rule comment says eslint-plugin-import has no TypeScript resolver                           |
| `harness-eval-ledger-stale`                           | 10        | 8      | observed    | —     | eval: the harness-eval ledger has no run since 2026-10-20                                                              |
| `changeset-backlog-36-pending`                        | 6         | 8      | observed    | —     | release: 52 changesets wait behind version pr #815                                                                     |
| `ci-runner-images-tag-pinned`                         | 3         | 8      | observed    | —     | ci: self-hosted dind and buildkit images are tag-pinned outside dependabot                                             |
| `desk-opencode-skill-evidence-unrecorded`             | 10        | 8      | observed    | —     | desk: no fixture shows the opencode provider reading a skill                                                           |
| `pnpm-version-duplicated`                             | 3         | 8      | observed    | —     | ci: pnpm version is repeated in four workflows and two dockerfiles                                                     |
| `tag-release-steps-untested`                          | 6         | 8      | observed    | —     | release: tag push and github release steps are inline bash without a test                                              |
| `coverage-floors-far-below-measured`                  | 4         | 8      | observed    | —     | testing: global floors trail measured coverage by 21-24 points                                                         |
| `windows-desk-no-preflight`                           | 8         | 8      | observed    | —     | dx: no preflight warns windows users before pnpm check fails in @repo/desk                                             |
| `audit-ignore-doc-drift`                              | 5         | 9      | observed    | —     | docs: security.yml points at package.json auditConfig while SECURITY.md names pnpm-workspace.yaml                      |
| `adr-0005-better-auth-unused-claim`                   | 9         | 9      | observed    | —     | docs: adr 0005 alternatives still call better-auth unused                                                              |
| `guide-size-budget-unenforced`                        | 9         | 9      | observed    | —     | ai: the context audit reports guide size but enforces no ceiling                                                       |
| `workspace-tree-not-derived`                          | 9         | 9      | observed    | —     | docs: no test derives the guide workspace tree or readme package count from manifests                                  |
| `dom-workspace-list-hand-maintained`                  | 1         | 9      | observed    | —     | lint: the dom workspace list in base.js and its contract test are both hand-kept                                       |
| `e2e-shard-comment-stale`                             | 4         | 10     | observed    | —     | ci: the e2e shard comment says 5 spec files, there are 26                                                              |

<!-- scorecard:generated:end -->

## Calibration notes

Binding on later runs. Each note records a judgment that should not be silently re-litigated: why a dimension sits where it does, or why a previous score was corrected.

### 2026-07-28 — first baseline (`15102fc`, sequential)

- **Baseline run.** Empty `runs` array before this date; all scores are initial calibration, not deltas. Mode is `sequential` (shared-context sweep, not nine parallel explorers) — compare later fan-out runs carefully.
- **CI topology vs CI stoppage.** Dimension 3 scores the job DAG and gate placement (path filters, single coverage run, shared Turbo cache, e2e artifact reuse). It does **not** drop below 7 solely because GitHub Actions refuses to start jobs for a reason outside the codebase. That operational failure is tracked as finding `github-actions-jobs-not-starting`. If the stoppage is fixed and topology is unchanged, do not raise dim 3 above 8 without a concrete topology improvement.
- **Knip is a hard gate.** `pnpm check` / `check:ci` / PR `check-fast` all run knip. A single unused dep (`@graphql-codegen/typescript`) currently fails the gate locally — dim 1 is 7 (solid mechanisms, one broken contract on main), not 9.
- **Audit high debt.** Dim 5 is 6 because catalog discipline is strong but `pnpm audit --audit-level high` is red (25 high). Many paths are Expo CLI / vitest→vite transitive; do not treat every advisory as a direct product CVE when scoring security vs hygiene.
- **Security app posture.** Dim 7 stays 7: CORS fail-closed, org session scope, digest-pinned images, Trivy CRITICAL hard gate, CodeQL+Gitleaks configured. Live workflow greenness is blocked by the same CI stoppage as dim 3.
- **Coverage mobile exclusion.** `apps/mobile/**` outside floors is intentional (measured ~3% app shell); do not ding dim 4 for that without a decision to re-include.

### 2026-08-21 — second run (`4cbdfeb`, sequential)

- **Stoppage persists into a second run.** All workflows still fail to start (~4s); releases frozen (release/api last advanced Jul 29, main at Aug 20), five changesets unversioned, Security/CodeQL dark. Dims 3 and 6 continue to score mechanism design per the 2026-07-28 calibration; operational impact stays in finding `github-actions-jobs-not-starting`. Resolving the stoppage is the single highest-leverage action for this repo.
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

- **Stoppage cleared; `github-actions-jobs-not-starting` → fixed.** Jobs execute since ~2026-09-01 (CodeQL 34126323459 green on 09-07). No push to main since 08-27, so Release is still unexercised; dim 6 holds at 8 per the 07-28 mechanism-not-operations rule.
- **Depth note.** Mode stays `sequential` (shared-context sweep), but three read-only `kaine-explorer` probes covered dims 1/2, 4/7, and 8/9. The drops in dims 2 and 8 are depth-driven discoveries that existed in earlier runs undetected; dims 1 and 5 are real regressions. Later runs must probe at least this deep before comparing deltas.
- **Mobile export red scored under dim 1, not dim 3.** The `expo export` failure is a package export-contract defect (`@repo/storage` barrel re-exports the S3 client), so dim 1 → 7 (#305). Dim 3 keeps scoring topology, unchanged at 7. Do not raise dim 1 above 7 until a gate separates client-safe from server-only package surface.
- **Dim 2 → 7 with reproduced cause.** `typecheck` has no dependency edge and omits shared-config inputs; a `packages/storage` source edit left web/api/mobile typecheck on cache HITs (#308). Do not raise dim 2 until invalidation is proven by a dry-run assertion or test.
- **Dim 5 → 5 with cause.** Audit 19→25 high (regression on #258), Dependabot security updates erroring, and the digest-refresh mechanism found absent (`renovate.json` inert, `dependabot.yml` npm-only, #306). Raise back to 6 when #306 lands; to 7+ only with the audit gate green.
- **Dim 8 → 7 with cause.** The documented `pnpm doctor` is shadowed by pnpm's built-in (#307); earlier runs credited it as a working gate. Local `pnpm check` red on gitignored `src-tauri/target` is recorded as observed, not filed.
- **Dim 4 held at 7 despite thinner depth than assumed.** Floors hold and the gate works; the missing cross-organization isolation test is filed (#309); schema-level and rendered-component gaps are observed. Coverage evidence unchanged since 07-25 by user choice (no local refresh this run).
- **Dim 9 held at 8.** Serena memories verified accurate; three stale mechanism claims (Renovate ×2, required checks) fold into #306.
- **Overall 7.4 → 7.0.** Two regressions (dims 1, 5) plus two depth discoveries (dims 2, 8); dims 3, 4, 6, 7, 9 re-evidenced flat.

### 2026-09-09 — fifth run (`c4189a5`, sequential + three explorer probes)

- **Raise conditions from 09-08 met and applied.** Dim 1 → 8 (#313: server-only gate in both client ESLint blocks, contract test, export proven). Dim 2 → 8 (#314: `^typecheck` edge and preset inputs, dry-run shows dependents invalidate). Dim 5 → 6 (#306 landed via #315; audit was green after #312). Dim 8 → 8 (#307: `pnpm preflight` honest, built-in-collision test).
- **Dim 5 stays below 7.** The audit gate went red again within a day (transitive advisories that Dependabot cannot patch in pnpm). Raise to 7 only when `pnpm audit --audit-level high` is green **and** the two policy gaps are closed (#323 Node-major ignore, #324 vitest group).
- **Dim 3 held at 7 with a new binding condition.** #318 and #320 merged with failing checks and main went red on Release, Security, and Docker images. Topology design is 8-capable; do not raise dim 3 until required checks exist (import the ruleset) or a merge queue is in use (#325).
- **Red gate on main scored like the knip precedent.** Dim 4 holds at 7 with the vitest lockstep guard red on main (mechanism works, one broken contract on main); dim 6 holds at 8 because the release mechanism itself is proven and the block is dim 4's gate.
- **Regression slug handled per rule.** `pnpm-audit-high-debt` was `fixed` on 09-08 and is detected again: recorded as `regression`, #258 reopened, no duplicate.
- **Depth floor kept.** Same three explorer probes as 09-08 (dims 1/2, 4/7, 8/9); deltas are like for like. Overall 7.0 → 7.4.

### 2026-09-09 — sixth run (`7e867a9`, fan-out: four explorer probes covering all nine dimensions)

- **First `fan-out` run.** Bands and every binding note above are unchanged, and four read-only `kaine-explorer` probes (dims 1/2, 4/7, 8/9, 3/5/6) exceed the three-probe floor from 09-08. The delta against the morning `sequential` run is reported but is cross-mode per the header rule; treat it as indicative.
- **Dim 4 → 8 with cause.** The 08-21 raise condition is met: after the vitest 4 re-baseline (#341) every floor has 3-8 points of headroom and the Coverage Threshold gate proved them on run 34330942328; the lockstep red cleared (#328). Do not raise to 9 until a schema-level GraphQL test and a rendered web component test exist.
- **Dim 5 → 7 per the 09-09 binding condition** (audit exit 0, #323 and #324 closed). Hold at 7 until the Dependabot npm updater job is green, the Cargo graph has a bot or audit gate, and security overrides are caret floors rather than exact pins.
- **Dim 7 → 8 with cause.** The audit gate is green on a Security push run for the first time, Dependabot refreshes every pin, and tenancy is runtime-proven by the isolation e2e. Do not raise to 9 until the introspection, depth/complexity, and confirm content-type gates have request-level tests.
- **Dim 8 → 7, depth discovery not regression.** The documented first run (`bootstrap` → `turbo run build`) compiles the Tauri app with no Rust preflight and then leaves `pnpm check` red on the gitignored target dir; `create-package` scaffolds a workspace the vitest-exclude contract test rejects. Both predate this run undetected. Raise back to 8 when both are fixed.
- **Dim 3 held at 7 (binding).** The ruleset file shipped (#342) but is not imported on this repository; three more red PRs merged today. New latent condition recorded: `codeql.yml` lacks a `merge_group` trigger the ruleset's required check depends on.
- **Dims 1, 2, 6, 9 held.** Dim 2's test-inputs gap is broadened (ruleset, workflow, and Dockerfile reads are unhashed too) and filed rather than re-scored, because the PR-path gate runs vitest uncached. Dim 9's stale-fact count grew (8 guide lines, 2 ADRs) but stays observed: hand-written facts have no gate, which is the known ceiling of band 8.
- **Overall 7.4 → 7.7.** Dims 4, 5, 7 up one each with cited causes; dim 8 down one on depth; the rest re-evidenced flat.

### 2026-09-10 — seventh run (`cd623ee`, fan-out: four explorer probes covering all nine dimensions)

- **Dim 8 → 8 with cause.** The 09-09 raise condition is met: `bootstrap` excludes the Tauri compile (#365, contract-tested), `create-package` satisfies the vitest-exclude contract (#362, node test in Check Fast), and the `--` separator no longer breaks `ai:install` (#370). Proven on a fresh clone without Rust: bootstrap exit 0 in 29s, `pnpm check` exit 0 in 49s.
- **Dim 5 held at 7 — expectation tested and rejected.** #369's repo-level `minimumReleaseAge` did not turn the npm updater green; it fails on a different package now, because peer-keyed vitest snapshots re-resolve on an `@types/node` bump and any transitive younger than 3 days is refused. Raise to 8 only when the updater job is green after the policy choice on #356 (pnpm 11, or a Dependabot-only cooldown without the repo gate).
- **Dim 3 held at 7 (binding).** Every prerequisite for applying the ruleset now exists (merge_group on CodeQL, cache seed, job-name contract); the hold lifts when required checks are in use. Speed evidence recorded: PR wall clock 8m06s → 5m57s after the cache seed; the api image job is now load/Trivy/SBOM-bound, not compile-bound.
- **Dims 1, 2, 4, 6, 7, 9 held at 8; what 9 needs, recorded.** Dim 2: an automated inputs-versus-reads check. Dim 4: a session-scoped feature operation through the schema and a rendered web component test. Dim 6: a test of the `release:apps` git path. Dim 7: a sweeping tenancy contract or lint, explicit cookie/password config, and scanners that can block merges. Dim 9: doc facts derived from manifests by a test rather than verified by hand.
- **Slugs closed this run:** eleven findings from the 09-09 run plus `docs-version-facts-stale` and `translation-team-language-drift` (#371) and the new `bootstrap-ai-install-separator-rejected` (#367). No new issue filed: the remaining findings are observed depth or not-enforced items.
- **Proofs still pending at run time:** Friday's Deep Checks (first desktop build with the moved target dir), Monday's scheduled Security and CodeQL runs, and the first weekly Dependabot pass under five ecosystems. The next run should read them before comparing.
- **Overall 7.7 → 7.8.** One raise (dim 8); everything else re-evidenced flat.

### 2026-10-18 — eighth run (`c794e07`, fan-out: five explorer probes covering all ten dimensions)

- **First ten-dimension run.** Dimension 10 gets its baseline (7), so the overall (7.6) averages ten dimensions and is not comparable with the nine-dimension 7.8 of 09-10 (header rule). The nine-dimension mean on this run is 7.7. Depth floor kept: five probes (dims 1/2, 4/7, 3/5/6, 8/9, 10).
- **Dim 3 → 8, binding hold lifted.** The 09-09 hold ("do not raise until required checks are in use") is met: two rulesets are active on main and require PR Quality Gate and Analyze TypeScript, and the rule file is contract-tested. Do not raise to 9 until the comment-only list alignments (docker-cache paths, node --test list) are tested and tooling tests run on the PR path.
- **Dim 5 → 8, binding raise condition met.** #356 closed and the grouped npm updater ran green (#471). The two remaining `ignoreGhsas` entries are accepted risk with tracked issues and no upstream fix; they do not hold the score while their issues stay open with a recheck.
- **Dim 4 → 7 with cause, although the 09-10 conditions for 9 landed.** A schema-level tenancy test and rendered component tests now exist, but about 2,200 tooling tests run only after merge, in Release. Gate placement for these tests is scored here, not under dim 3, so the gap is counted once. Raise back to 8 when tooling tests run in PR CI (or the exclusion is a recorded decision with its upgrade trigger).
- **Dim 2 → 7 with reproduced cause.** `turbo run test --filter=@repo/desk --dry=json` shows that no root file the desk tests read is hashed, and Release caches most test tasks. Same class as #353/#366, reintroduced by new workspaces. Raise back to 8 when tooling test inputs are declared; 9 still needs the automated inputs-versus-reads check.
- **Dim 7 → 7 with cause.** The public flip turned on code scanning; 28 alerts sat untriaged for up to five weeks, the web runner stage ships fixable HIGH Alpine CVEs, and the scrypt cost is below the OWASP floor. Most CodeQL highs checked are false positives; dismissing them with a reason is part of the fix. Raise back to 8 when alerts are triaged, the web image refreshes OS packages, and the scrypt cost meets the floor.
- **Dims 1, 6, 8, 9 held at 8.** New tooling workspaces respect boundaries; release mechanics stay proven; onboarding scripts all resolve; doc coverage of desk and factory landed with ADRs 0010/0011. The 09-10 conditions for 9 are unchanged.

### 2026-10-20 — ninth run (`9cf8364`, fan-out: five explorer probes covering all ten dimensions)

- **Like-for-like with 10-18.** Same ten dimensions and probe split (dims 1/2, 4/7, 3/5/6, 8/9, 10), so deltas compare directly. Overall 7.6 → 8.0 on 29 merged PRs (#488–#549). Main is green on every workflow; CI PR and Deep Checks were dispatched on main and passed (runs 39406173469, 39406169156).
- **Dim 2 → 8, not 9, by a strict reading.** The 10-18 raise condition (tooling test inputs declared, #497) is met, and the automated inputs-versus-reads check that 9 required exists (#517). It is held at 8 because the probe found a read the check misses — the ESLint contract test loads root `eslint.config.mjs`, which `packages/config/turbo.json` does not hash — and because `MONOREPO_GUIDE.md` does not document the inputs rule. Raise to 9 when that read is hashed (or registered) and the rule is in the guide. Do not count the check as proving completeness: it is a floor by design.
- **Dim 6 → 9 with cause.** The 09-10 condition — a test of the `release:apps` git path — is met by #523 against a real seed, bare origin, and clone, proven red by disabling the fast-forward guard. Hold at 9 only while pushes stay consistent: the non-atomic push loop (`release-push-non-atomic`) is the first thing to fix; if a split release ever ships, drop to 8.
- **Dim 4 → 8 and dim 10 → 8 with cause.** Dim 4: tooling tests gate PRs (#498) and the exclusion is recorded. Dim 10: every baseline gap now has a gate (#512); 9 needs at least one reviewed live run in the committed ledger, which costs money and needs the owner.
- **Dim 7 held at 7 (binding).** Two of three raise conditions are met (#495, #496), and alert triage is mostly done (14 CodeQL dismissed with reasons, 11 stale Trivy closed by the main rescan, #510). The two api-image Trivy findings (uuid 7.0.3, decode-uri-component 0.2.2, fixed only in new majors under the Expo toolchain) have no disposition, which `SECURITY.md:65` requires. Raise to 8 when each has a fix or a recorded accepted-risk disposition.
- **Dims 1, 3, 5, 8, 9 held at 8.** Their earlier observed gaps closed (#513, #519, #521, #536, #544), and the band-9 gaps are now documentation, a remaining comment-only alignment (Docker build inputs), hand-kept override floors, a Windows preflight, and manifest-derived doc facts. Dim 9 picked up a new defect from this round: ADR 0005's body contradicts its own status line (`adr-0005-stale-cost-defaults`).
- **Turbo tag rules: declined on purpose.** ESLint already enforces the client/server split at subpath granularity (`packages/config/eslint/base.js:14-15`), which package-level tags cannot express, because web and mobile import client-safe subpaths of `@repo/auth` and `@repo/storage`. Do not score their absence as a gap.
- **Corrected probe finding.** `Dockerfile.api` builds its runner from the `base` stage, which runs `apt-get upgrade` on the weekly key; the api image does refresh OS packages. Not recorded as a finding.

### 2026-11-02 — desk job 1 (`87b8219`, fan-out)

- **Full depth, like for like with 10-20.** Five probes with the same split (dims 1/2, 4/7, 3/5/6, 8/9, 10), all returned, all ten dimensions scored. Overall 8.0→7.7 across the 22→27 package feature wave (#695-#841).
- **Dim 6 9→8 with cause, not a split release.** The 10-20 note dropped to 8 only on a shipped split. This drop has a different cause: band 9 needs a gate that would fail on regression, and #715 added untested GHCR publish and deploy jobs (release.yml:204-397). The non-atomic push (.ai/release-apps.util.ts:246-249) now also loses the deploy-image output (.ai/release-apps.ts:99-106). Raise back to 9 when the push is atomic or the output is written per branch, and the publish/deploy path has a test.
- **Dim 1 8→7 with cause.** The server-only pattern (base.js:14-15) misses the new Node-only billing and jobs. Raise back to 8 when both are covered and contract-tested.
- **Dim 7 7→8 per the 10-20 binding condition** (Trivy #23/#24 fixed by overrides). Toward 9: the PR image gate blocks HIGH, the CSP/HSTS headers have a test, and #98/#99 have recorded dispositions.
- **Dim 9 8→6 with cause.** Four hand-written structure facts are wrong and ADR 0017 cites a missing ADR 0016, with no gate. Raise back to 8 when they are corrected.
- **Dim 4 held at 8.** Real gains (schema-sweeping tenancy contract, 29 rendered web tests) are offset by floors that now trail measured coverage by 21-24 points. Raise to 9 when floors sit within about 5 points of measured and the attachment e2e runs in CI.
- **changeset-release action_required explained.** The cause is repo-setup.json:20 fork_pr_contributor_approval, not ci-pr.yml. Tracked as version-pr-runs-held-docs-stale. The fix is a settings or token choice for the owner.

### 2026-11-04 — desk job 2 (`7766e29`, fan-out)

- **Full depth, like for like with 11-02.** The five probes used the same split (dims 1/2, 4/7, 3/5/6, 8/9, 10), all returned, and all ten dimensions are scored. Overall 7.7→7.9. The only movement is dim 9.
- **Dim 9 6→8 per the 11-02 binding note.** #848 corrected the guide tree, the readme count, the ADR index, the ADR 0016 citation, ADR 0005, and the Serena overview. The probes verified each fix at 7766e29. Not 9: no manifest-derived check stops the same drift from coming back.
- **Dim 2 held at 8; lint ^ edge confirmed.** The lint task (turbo.json:50-58) runs typed rules over sibling source with no dependency edge. This is the class #308 fixed for typecheck. A fix is part of the band-9 condition, but it does not drop the score: the PR path runs lint, and the stale hit needs a type-only change in a dependency.
- **CodeQL #114 is a false positive.** The slugify input has no repeated dashes after worktree.bootstrap.ts:31. It does not hold dim 7. It still needs a dismissal with a reason.
- **Dims 1 and 6 held.** #846 and #847 are filed and open. Their 11-02 raise conditions are unchanged.

### 2026-11-09 — twelfth run (`5babf89`, fan-out)

- **Full depth, like for like with 11-04.** Five probes with the same split (dims 1/2, 4/7, 3/5/6, 8/9, 10), all returned, all ten dimensions scored. Overall 7.9→7.9. No dimension moved.
- **Real fixes that did not move a score.** #870 met one dim 2 band-9 condition (lint `^typecheck` edge). #917 and #872 closed every open code-scanning alert and the four dim 5 floor and ignore gaps. Each dimension still has an unmet band-9 condition from an earlier note, so none rises.
- **Release red on main is not a split release.** 0ffad135 failed on a desk test flake and 2dfa48ff at the changesets step after a hand merge into `changeset-release/main`. The flake is scored under dim 4 per the 09-09 red-gate precedent. Dim 6 holds because `release:apps` ran before the failing step and `deploy-images` still ran.
- **Scores describe 5babf89, not the open fix PRs.** #921 (#846 and the `.test.js` inputs gap), #922 (#847 and the version-PR branch warning) and #923 (the watcher flake) carry this run's fixes; the ledger PR carries two doc drifts and #931 the third. Score them when they merge: dim 1 → 8 on #846 per the 11-02 note; dim 6 stays 8 until the publish/deploy path also has a test.
