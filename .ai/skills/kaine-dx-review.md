---
name: kaine-dx-review
description: Review the developer experience of a plan, diff, CLI, or workspace — pick the developer persona, trace their journey from clone to first success, score eight DX passes, and check every error message against a fix-first rubric. Reads only. Not for code review (kaine-review) or the repo-health scorecard (kaine-scorecard).
argument-hint: issue number, plan, diff, CLI command, or workspace
---

# Developer Experience Review Workflow

Use this skill to judge how a change feels to the developer who has to use it.

## Goal and non-goals

- Goal: a scored DX review with the developer's journey, the friction points, and the fix for each one.
- Read only. Do not run `pnpm quick-setup`, start services, or change files. Trace commands from the code and docs.
- Do not review code quality. `kaine-review` owns that.

## Read first

- `README.md` Quickstart and "Build a feature".
- `docs/agents/day-one.md` and `docs/troubleshooting.md`.
- The scripts the target touches in `package.json`, `scripts/doctor.mjs`, and the CLI source (for example `.ai/create-feature.ts`).

## Steps

1. **Pick the persona,** with evidence from the target:
   - an adopter on day one, who cloned the template and wants it running;
   - a feature developer, who adds a feature to a running project;
   - an AI coding agent, which reads errors literally and cannot ask.
2. **Trace the journey.** List each step from the persona's start to their first success, for example the README Quickstart, then `pnpm quick-setup`, then `pnpm create:feature`, then the first PR. Cite the command and the file for each step. Count the steps and estimate the time to first success.
3. **Check each error message** on the path against the rubric:
   - what failed, in the developer's words;
   - why it failed;
   - the exact command or edit that fixes it;
   - a link to the docs section;
   - no secret, token, or full environment in the output.
4. **Score eight passes from 0 to 10.** For each, give the evidence and the fix that raises the score:
   - getting started
   - CLI and script ergonomics
   - error messages
   - docs
   - defaults and configuration
   - upgrade path (`pnpm ai:sync`, template adoption)
   - dev-loop speed
   - agent readiness (machine-readable output, `--json`, errors an agent can act on)

## Report

- The persona and the journey table: step, command, file, and friction.
- The score table: pass, score, evidence, and fix.
- Findings, ordered by the developer time each one costs, each with a `path:line` where there is one.

## Headless runs (Agent Desk)

When the prompt supplies a result schema, fill the schema. Do not ask the user a question. Record each unknown as a finding, and state the default you chose. Put the plain-language ending in the schema's plain-language field. Do not print a banner or add any text outside the schema.
