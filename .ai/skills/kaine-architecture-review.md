---
name: kaine-architecture-review
description: Independently review the module design of an implementation plan before the build — design it a second, different way, check for module-design red flags, and confirm package boundaries, reuse, failure modes, and test layers. Not for writing the plan (kaine-write-plan) or reviewing a finished diff (kaine-review).
argument-hint: plan, issue number, or the paths a plan changes
---

# Architecture Review Workflow

Use this skill to review a plan that someone else wrote, before code is written.

## Goal and non-goals

- Goal: confirm that the plan's design is the simplest one that holds, or name the better shape and why.
- Do not rewrite the plan. Report findings; the planner owns the plan.
- Do not repeat the planner's own challenge step. Review the plan as it is written.
- Do not judge code style. `kaine-review` owns finished diffs.

## Read first

- The plan and the issue it answers.
- `MONOREPO_GUIDE.md`: package boundaries, feature folders, and naming.
- The code the plan touches. When the Graphify CLI is installed, run `graphify affected "<symbol>"` (`kaine-graph`) for each shared symbol, and verify each lead in the code.

## Steps

1. **Design it twice.** Sketch one structurally different design for the same outcome. Compare the two on how much each hides behind how small an interface. Keep the better one, and say why.
2. **Check the red flags.** Report each one you find with a `path:line`:
   - a shallow module: an interface almost as complex as what it hides;
   - details that leak through an interface;
   - code split by time order instead of by what changes together;
   - pass-through layers that add nothing;
   - one concept owned in two places;
   - two ways to do the same thing;
   - internals imported across `@repo/*` boundaries;
   - lists that must be kept in sync by hand.
3. **Check the scope.** A plan of more than 8 files, or one with more than 2 new modules, needs a stated reason. Name what already exists that the plan could reuse.
4. **Check the failure modes.** For each risky path, say what breaks, how we would notice, and which test layer catches it.

## Report

- The verdict: `sound`, `adjust`, or `redesign`, with one sentence of reason.
- The second design, and why it wins or loses.
- Findings, each with a `path:line` and the change it asks for.

## Headless runs (Agent Desk)

When the prompt supplies a result schema, fill the schema. Do not ask the user a question. Record each unknown as a finding, and state the default you chose. Put the plain-language ending in the schema's plain-language field. Do not print a banner or add any text outside the schema.
