# Monorepo Health Scorecard

Repeatable, evidence-bound health scoring for this monorepo. Produced by the `kaine-scorecard` skill; rendered to `scorecard-out/index.html` by `pnpm scorecard`.

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
| 2026-09-10 | `cd623ee` | fan-out    | claude   | **7.8** | 9    | 14             |
| 2026-09-09 | `7e867a9` | fan-out    | claude   | **7.7** | 9    | 4              |
| 2026-09-09 | `c4189a5` | sequential | claude   | **7.4** | 9    | 9              |
| 2026-09-08 | `5f6f91f` | sequential | claude   | **7**   | 9    | 6              |
| 2026-08-21 | `aef4493` | sequential | opencode | **7.4** | 9    | 2              |
| 2026-08-21 | `4cbdfeb` | sequential | opencode | **7.3** | 9    | 2              |
| 2026-07-28 | `15102fc` | sequential | grok     | **7.3** | 9    | 2              |

### Latest scorecard — 2026-09-10 (`cd623ee`, fan-out)

| #   | Dimension                | Score    |              | Δ   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------ | -------- | ------------ | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Workspace & Boundaries   | 8.0      | `████████░░` | 0   | Server-only regex defined at packages/config/eslint/base.js:14-15 and applied in both client blocks (:95, :121), contract-tested at monorepo-alignment.test.ts:707-741; 0 deep @repo/*/src                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | dist imports and every @repo/x/y subpath in use maps to a declared exports key; all 13 packages declare exports; knip exit 0; pnpm boundaries green (1137 files, 19 packages) once the pre-#365 Tauri target dir was removed; Mobile Export green on PR CI. Observed unchanged: knip.json:76-78 ignores two undeclared deps and unused zod (packages/auth/package.json:81); @repo/logger reachable from mobile by design; one @boundaries-ignore |
| 2   | Build & Cache            | 8.0      | `████████░░` | 0   | #366 closed the test-hash gap: @repo/config#test dry-run has 561 inputs including .github/rulesets/main.json, all 7 workflow ymls, Dockerfile.api/web, MONOREPO_GUIDE.md, DESIGN_SYSTEM.md, .gitignore, root package.json and turbo.json; every root path read by packages/config/*.test.ts is hashed (0 missing); @repo/ui#test hashes DESIGN_SYSTEM.md; lists pinned at monorepo-alignment.test.ts:856-891; global hash exactly pnpm-workspace.yaml + tsconfig.base.json; .tauri-target and .claude/worktrees/ gitignored and outside every hash. Observed: @repo/desktop#build still depends only on @repo/config#build while its script builds @repo/web inline (bounded by cache:false and the bootstrap filter); no automated check that files a test reads appear in turbo inputs (the pinned list is hand-maintained)                                                                                                                                                                                                                                                                  |
| 3   | CI Topology & Speed      | 7.0      | `███████░░░` | 0   | Held by the binding condition: rulesets/branch protection still 403 on this repository, #325 open. Topology improved: docker-cache.yml (push to main, path list equal to ci-pr's docker filter, identical SHA pins) seeded green on 003c064 and cd623ee; PR 34401778755 wall clock 5m57s (was 8m06s) with Docker Image (api) 5m43s and 16 CACHED layers, now dominated by image load + two Trivy passes + SBOM (~3m40s) after a 30s compile; codeql.yml:9 runs on merge_group and monorepo-alignment.test.ts:210-230 asserts it for every required check; deep-checks.yml:85-89 caches the moved .tauri-target. Observed: docker-cache path list equals ci-pr's by comment only; Deep Checks last ran 2026-09-08 at 5f6f91f (pre-fix red), next scheduled Fri                                                                                                                                                                                                                                                                                                                                  |
| 4   | Testing & Coverage       | 8.0      | `████████░░` | 0   | Coverage Threshold green on PR 34401778755: 142 test files, lines 50.15 / statements 49.49 / functions 43.42 / branches 42.67 vs floors 45/45/40/38; 152 test files on disk; apps/api/src/server.hardening.test.ts drives the real Yoga handler on an ephemeral port and asserts 400 + message for introspection, depth, and complexity with positive controls (:93-171), reading limits from resolveApiRuntimeConfig (:131,:153); storage content-type mismatch covered at storage.lifecycle.test.ts:130-158; scripts/create-package.test.mjs registered in root test (package.json:27) and Check Fast (ci-pr.yml:220). Observed: no test runs a session-scoped feature operation through the schema (todos.router.test.ts:19 calls resolvers directly); cross-organization e2e covers todos only; 6 of 11 web tests read source text, 0 render; invitation/attachment e2e still test.skip                                                                                                                                                                                                    |
| 5   | Dependency Hygiene       | 7.0      | `███████░░░` | 0   | Binding raise condition unmet: the npm updater job is still red (34387229249) under a new mechanism: with minimumReleaseAge 4320 (pnpm-workspace.yaml:70) Dependabot's second step pnpm install --lockfile-only rejects obug@2.2.1 (12h old, locked since bf15118) because vitest/@vitest/coverage-v8 snapshot keys include the @types/node peer, so an @types/node bump re-resolves that subtree; #356 relabelled ready-for-human (pnpm 11 vs Dependabot-only cooldown). Otherwise strong: five ecosystems (dependabot.yml:10,100,121,140,161) with groups and major ignores, cargo/docker-compose/docker/github-actions jobs green on first run; every override a caret floor (pnpm-workspace.yaml:77-108), tar override gone, esbuild ^0.28.1; audit exit 0; alerts 0 high / 5 medium / 2 low; 0 open bot PRs; 28 majors behind, all covered by ignores or #287 except @clack/prompts and the deliberate mobile tailwindcss 3 line                                                                                                                                                          |
| 6   | Release & Deploy         | 8.0      | `████████░░` | 0   | Release green on cd623ee (34441002649): release/api and release/web advanced to cd623ee and the changesets action opened version PR #372 (@repo/translation 1.3.2, @repo/web 1.6.2 plus dependents); tags for 10 packages published 2026-09-09; .ai/release.util.ts:7-8,17-18 now count .npmrc and scripts/fix-esm-extensions.mjs as image inputs with spec cases (release.util.spec.ts:118,124); Dockerfiles unchanged and digest-pinned. Observed: the git path of .ai/release-apps.ts (fetch, merge-base, update-ref, push) has no test; version-PR CI runs stop at action_required until a maintainer approves them (runs 34441235642/34441235725; #317 needed a human re-run); tags publish only on the last green commit of a merge burst                                                                                                                                                                                                                                                                                                                                                |
| 7   | Security Posture         | 8.0      | `████████░░` | 0   | Audit exit 0 (Security 34441002645 green), CodeQL green, Gitleaks green; request-level hardening tests landed (#368: server.hardening.test.ts:93-171; content-type at the service layer storage.lifecycle.test.ts:130-158); tenancy: 36 requireOrganizationScope router calls, adapters filter scope.organizationId, runtime-proven by the isolation e2e; minimumReleaseAge gate for human installs; frozen lockfile in every CI install; digest-pinned bases with Trivy CRITICAL gate + SBOM; compose images now under the docker-compose ecosystem (dependabot.yml:161) though still tag-pinned (docker-compose.yml:3,19,31); SECURITY.md. Observed: cookie attributes and server password minimum rely on better-auth defaults (auth.instance.ts:174-176 sets only cookiePrefix; client-side min 8 only); no sweeping contract test or lint that every resolver resolves scope from session; scanners cannot block merges without required checks                                                                                                                                           |
| 8   | DX & Onboarding          | 8.0      | `████████░░` | ▲+1 | Raise condition met: bootstrap runs turbo run build --filter=!@repo/desktop (package.json:43), pinned by monorepo-alignment.test.ts:171,181-182; scripts/doctor.mjs:141-167 warns on a missing Rust toolchain and fails only with --with-desktop; the Cargo target moved to root .tauri-target (apps/desktop/src-tauri/.cargo/config.toml:7; .gitignore:20; deep-checks.yml:88) with a troubleshooting entry (docs/troubleshooting.md:102-117); create-package writes vitest.config.ts, tsconfig.build.json, .prettierignore (scripts/create-package.mjs:252-254) with scripts/create-package.test.mjs in root test and Check Fast; .ai/install.ts:243-244 accepts the pnpm run separator (install.spec.ts:14-17). Fresh-clone smoke at 4e6a8e1 with Rust off PATH: pnpm bootstrap exit 0 in 29s, pnpm check exit 0 in 49s; 36 documented pnpm commands all resolve; preflight honest (exit 1 only on the local placeholder secret); .claude/worktrees/ gitignored; type:perf label created. Observed: .vscode/launch.json:29-30 vitest debug still runs from the root without a vitest config |
| 9   | Docs & Agent Scaffolding | 8.0      | `████████░░` | 0   | ai:doctor --strict exit 0 and gating every PR; MONOREPO_GUIDE.md:56-57,78,79,84 now match pnpm-workspace.yaml, apps/web and apps/mobile manifests (React 19.2, Vite 8, Expo SDK 55, better-auth 1.7), check/coverage/mobile-export rows corrected (#371); ADR 0002:27 and 0003:32 carry dated status updates; dashboard.json en/de/sr use Organization wording; REVIEW.md equals .ai/review.md bar the generated header; serena environment_setup.md matches .nvmrc and packageManager; README:79, CONTRIBUTING.md:142-148, day-one.md correct. Observed: hand-written facts are verified by hand, not by a manifest-derived test (monorepo-alignment.test.ts:420-467 pins only theme/SDL/styling/flags/catalog:mobile strings); serena task_completion_checklist.md:14 omits boundaries and knip and suggested_commands.md omits pnpm preflight; kaine-adopt-template.md:37 keeps a dead src-tauri/target glob                                                                                                                                                                                |
| 10  | AI & Agent Quality       | unscored | `——————————` | —   | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Overall: 7.8** (▲+0.1)

### Findings

| Slug                                                  | Dimension | Ladder | Disposition | Issue | Title                                                                                                         |
| ----------------------------------------------------- | --------- | ------ | ----------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| `bootstrap-builds-tauri-desktop`                      | 8         | 1      | fixed       | #351  | dx: pnpm bootstrap compiles the Tauri desktop app and leaves pnpm check red on every fresh clone              |
| `boundaries-local-red-tauri-target`                   | 8         | 1      | fixed       | #351  | tooling: turbo boundaries fails locally on gitignored apps/desktop/src-tauri/target output                    |
| `bootstrap-ai-install-separator-rejected`             | 8         | 1      | fixed       | #367  | dx: pnpm bootstrap fails at ai:install because the -- separator reaches the installer                         |
| `create-package-missing-vitest-config`                | 8         | 1      | fixed       | #352  | tooling: create-package scaffolds a package that the vitest-exclude contract test rejects                     |
| `test-task-inputs-omit-doc-contracts`                 | 2         | 1      | fixed       | #353  | build: turbo test hash for packages/config omits the root files its contract tests read                       |
| `codeql-missing-merge-group-trigger`                  | 3         | 1      | fixed       | #354  | ci: codeql.yml never runs on merge_group while the ruleset requires Analyze TypeScript                        |
| `deploy-inputs-invisible-to-affected-gates`           | 6         | 1      | fixed       | #355  | release: files the api image copies are neither release:apps nor docker-filter inputs                         |
| `dependabot-npm-updater-red-types-node`               | 5         | 1      | open        | #356  | deps: the Dependabot npm updater job ends in error on @types/node every run                                   |
| `red-prs-merged-without-required-checks`              | 3         | 1      | open        | #325  | process: pull requests with failing checks reach main because required checks are not enforced                |
| `desktop-build-hash-omits-web`                        | 2         | 1      | observed    | —     | build: apps/desktop build task hash excludes @repo/web sources and its tauri output is not a turbo output     |
| `esbuild-override-pins-advisory-floor`                | 5         | 2      | fixed       | #357  | deps: the exact esbuild override pins the version an open advisory names as vulnerable                        |
| `cargo-deps-unaudited`                                | 5         | 2      | fixed       | #357  | deps: the Tauri Cargo graph has no bot ecosystem and no audit gate                                            |
| `compose-images-tag-pinned-outside-dependabot`        | 7         | 2      | fixed       | #357  | deps: docker-compose postgres and minio images are tag-pinned and not bot-managed                             |
| `auth-cookie-password-policy-implicit`                | 7         | 2      | observed    | —     | security: cookie attributes and server password minimum rely on better-auth defaults                          |
| `hardening-gates-untested`                            | 7         | 4      | fixed       | #358  | security: introspection-off, depth/complexity, and confirm-time content-type gates have no request-level test |
| `test-input-coverage-not-gated`                       | 2         | 4      | observed    | —     | build: no automated check that files a test reads appear in its turbo inputs                                  |
| `no-schema-level-graphql-test`                        | 4         | 4      | observed    | —     | testing: no test runs a session-scoped feature operation through the schema                                   |
| `e2e-cross-org-todos-only`                            | 4         | 4      | observed    | —     | testing: cross-organization isolation is asserted for todos only                                              |
| `web-tests-source-string-assertions`                  | 4         | 4      | observed    | —     | testing: web feature tests assert on source text, no rendered component tests                                 |
| `tenancy-enforced-by-convention`                      | 7         | 4      | observed    | —     | security: no contract test or lint guarantees every resolver resolves scope from session                      |
| `dependabot-security-updates-transitive-not-possible` | 5         | 5      | observed    | —     | deps: Dependabot security updates for transitive pnpm dependencies end security_update_not_possible           |
| `required-status-checks-not-enforced`                 | 3         | 5      | observed    | —     | ci: no required status checks, the ruleset is not imported on this repository                                 |
| `code-scanning-uploads-disabled`                      | 7         | 5      | observed    | —     | security: code scanning not enabled, so CodeQL and Trivy results never reach the Security tab                 |
| `docker-cache-cold-on-every-new-branch`               | 3         | 6      | fixed       | #359  | ci: the Docker layer cache is never seeded from main, so each branch's first build runs cold                  |
| `docker-image-job-dominated-by-scan-export`           | 3         | 6      | observed    | —     | ci: the api image job spends about 3m40s on image load, two Trivy passes, and SBOM after a 30s compile        |
| `version-pr-ci-held-action-required`                  | 6         | 8      | observed    | —     | release: changesets version PR CI runs stop at action_required until a maintainer approves them               |
| `docker-cache-path-list-comment-only`                 | 3         | 8      | observed    | —     | ci: docker-cache.yml path list and pins match ci-pr.yml by comment only                                       |
| `majors-uncovered-by-ignore-or-287`                   | 5         | 8      | observed    | —     | deps: @clack/prompts and the mobile tailwindcss major sit outside ignores and #287                            |
| `knip-ignore-stale-and-laundering`                    | 1         | 8      | observed    | —     | tooling: knip.json ignoreDependencies hides two undeclared deps and one unused dep                            |
| `eslint-duplicate-resolution`                         | 5         | 8      | observed    | —     | deps: eslint ^9.35.0 resolves to 9.39.2 and 9.39.5 in one lockfile                                            |
| `ci-scripts-test-list-comment-only`                   | 3         | 8      | observed    | —     | ci: the scripts test list in Check Fast duplicates the root test script with comment-only alignment           |
| `deep-checks-red-until-next-schedule`                 | 3         | 9      | observed    | —     | ci: Deep Checks is red on its last runs, all before the mobile export fix                                     |
| `docs-version-facts-stale`                            | 9         | 10     | fixed       | —     | docs: MONOREPO_GUIDE.md and ADRs 0002/0003 carry superseded version and gate facts                            |
| `serena-memories-minor-drift`                         | 9         | 10     | observed    | —     | docs: serena task_completion_checklist omits boundaries/knip and suggested_commands omits pnpm preflight      |
| `launch-json-vitest-config-broken`                    | 8         | 10     | observed    | —     | dx: .vscode/launch.json vitest debug config runs from the root without a vitest config                        |
| `translation-team-language-drift`                     | 9         | 11     | fixed       | —     | i18n: dashboard.json uses Teams/squads/timove where CONTEXT mandates Organization                             |

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
