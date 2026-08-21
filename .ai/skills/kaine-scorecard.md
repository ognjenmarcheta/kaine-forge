---
name: kaine-scorecard
description: Scan the monorepo, score it on nine health dimensions against evidence, render a visual dashboard, and file evidence-verified must-fix findings as GitHub issues.
argument-hint: optional dimension to focus, or "file" to open issues
---

# Monorepo Health Scorecard

**North star:** Score the repo on nine dimensions where every number traces to a command output or a `path:line`. Calibrate against the previous run before grading. File only evidence-verified must-fixes.

Use this skill to assess and track repo-level health — workspace, build, CI, testing, dependency, release, security, DX, and scaffolding quality. Not for reviewing a diff, branch, or PR (`kaine-review`), and not for disposing findings that already live in an issue (`kaine-triage-issue`).

The ledger `docs/agents/monorepo-scorecard.md` is the source of truth for scores, band descriptors, finding slugs, and calibration notes. Read it before doing anything else.

## Rubric

Nine dimensions, scored 0-10. Each needs a machine feed **and** judgment. Band descriptors live in the ledger — apply them verbatim, never invent intermediate definitions.

| #   | Dimension                | Primary evidence                                                               |
| --- | ------------------------ | ------------------------------------------------------------------------------ |
| 1   | Workspace & Boundaries   | `pnpm-workspace.yaml`, package `exports`, `pnpm boundaries`, `pnpm knip`       |
| 2   | Build & Cache            | `turbo.json` `dependsOn`/`inputs`/`outputs`, global hash surface               |
| 3   | CI Topology & Speed      | job DAG and gates across `.github/workflows/*`, `gh run` timings               |
| 4   | Testing & Coverage       | `vitest.coverage.config.ts` floors vs measured, excluded workspaces            |
| 5   | Dependency Hygiene       | catalog usage and drift, `pnpm audit`, Dependabot/Renovate state               |
| 6   | Release & Deploy         | `.changeset/`, `pnpm release:status`, `release/<app>` branches, `Dockerfile.*` |
| 7   | Security Posture         | CodeQL, Trivy, secret scan, auth/tenancy/CORS gates, base-image pinning        |
| 8   | DX & Onboarding          | `pnpm doctor`, `quick-setup`/`bootstrap`, editor config, script honesty        |
| 9   | Docs & Agent Scaffolding | `pnpm ai:doctor`, CONTEXT/ADR/REVIEW coverage, Serena memory accuracy          |

`REVIEW.md` governs diffs; this rubric governs the repo. REVIEW violations feed dimensions 1, 7, and 9.

## Run

1. **Read the ledger.** Previous per-dimension scores, their evidence lines, the band descriptors, and every calibration note. Grading before reading these is the failure this ledger exists to prevent.
2. **Sweep once, in shared context.** `turbo.json`, `pnpm-workspace.yaml`, every `package.json`, the workflows, `knip.json`, `vitest.coverage.config.ts`, `.changeset/`, `Dockerfile.*`. Run `pnpm ai:doctor`. Read the last main CI result via `gh run list`/`gh run view` rather than re-running `pnpm coverage` or `test:e2e` locally. Read `coverage/coverage-summary.json` if present. Run one `gh issue list --state all --limit 100 --json number,title,state`.
3. **Fan out.** Dispatch one `kaine-explorer` per dimension, each handed the sweep digest, its band descriptors, and its previous score and evidence. Where subagents are unavailable, scan sequentially and record `mode: sequential` — never silently mix depths.
4. **Score.** Apply the bands. A dimension moving more than 1 point must cite a concrete cause (merged PR, closed issue, new gate) **or** be recorded as an explicit recalibration with a reason, which becomes binding on later runs.
5. **Render.** Update the ledger's `scorecard:data` JSON block, then `pnpm scorecard`. Report in chat with bar gauges and deltas; point at `scorecard-out/index.html` for the diagrams.

## Findings & Issues

Rank findings by the `kaine-review` priority ladder. File one only when **both** hold:

- It sits in the upper ladder tiers or drops a dimension below its band, **and**
- It is reproduced with a `path:line` citation or a command output.

Everything else is recorded in the ledger as `observed` with the reason it was not filed.

Give every finding a deterministic slug and match it against ledger slugs and the fetched issue titles. A finding whose slug is recorded `fixed` but is detected again is a **regression**: reopen or link the original, never file a duplicate.

Propose the full table and **wait for an explicit go-ahead before filing.** Then, per issue:

- Title `scope: lowercase declarative statement of the defect`. No priority prefixes.
- Body `## What` / `## Evidence` / `## Why it matters` / `## Suggested fix` / optional `## Related` / `## Origin`. `## Origin` cites the run date, commit, overall score, and the ledger path.
- Labels: one `type:*`, one or more `area:*`, and `ready-for-agent` (or `ready-for-human` when no agent fix exists).

See `docs/agents/issue-tracker.md` for `gh` usage and `docs/agents/triage-labels.md` for the triage roles.

## Safety Rules

- `scorecard-out/` is local, regenerable, gitignored and dockerignored. Never commit it; never paste it into tracked docs or Serena memories.
- The ledger's `scorecard:generated` region is written by `pnpm scorecard`. Hand-edit only the JSON block and the calibration notes.
- Never invent a score for a dimension whose evidence you could not gather. Record it as `unscored` with the reason and exclude it from the overall.
- This skill is human-invoked. Do not add it to CI, husky hooks, or `pnpm initialize`.

## Output

| Dimension | Score | Δ   | Evidence               |
| --------- | ----- | --- | ---------------------- |
| …         | 0-10  | ±   | command or `path:line` |

Then: overall score with delta, the proposed issue table (title, labels, slug, ladder rank), findings observed but not filed with reasons, any recalibrations recorded, and the verification close naming what you actually ran.
