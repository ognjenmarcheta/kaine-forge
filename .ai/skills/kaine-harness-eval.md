---
name: kaine-harness-eval
description: Measure whether a specific guide or agent-definition rule actually changes agent output, and record the verdict in the harness-eval ledger.
argument-hint: the rule to measure, or "next" to take the first unmeasured one
---

# Measure a Harness Rule

Use this skill to answer one question about one rule: does it change agent
output at all? `docs/agents/automation-gap-audit.md` lists guide efficacy as an
open gap, and an unmeasured rule costs tokens on every single turn whether or
not it works.

## Safety rules

- **Human-invoked only.** Do not add this to CI, husky hooks, `pnpm check`, or
  `pnpm initialize`. It is slow, it costs model calls, and it measures judgment.
- **Strip only what the trial agent can actually see.** Prove it with the
  sentinel probe below before spending a single trial. Stripping a file that is
  not in the trial's context buys a guaranteed null result at full price.
- **Never invent a verdict.** Every trial row needs a transcript citation. If
  you did not run the trial, the row does not exist.
- **Restore before you record.** Put back every file you stripped, then confirm
  `pnpm ai:doctor --strict` exits 0 and `git status` is clean.

## What a trial agent can see

Measured 2026-09-11 with three no-tool probes against `kaine-implementer`
dispatched from a Claude Code session:

| Surface                                                 | In the trial's context | Editable mid-session           |
| ------------------------------------------------------- | ---------------------- | ------------------------------ |
| `.ai/agents/<agent>.md`, installed to `.claude/agents/` | yes                    | **no** — read at session start |
| `AGENTS.md` / `CLAUDE.md` project instructions          | **no**                 | n/a                            |
| the task prompt you write                               | yes                    | yes                            |

Two consequences decide the whole method:

1. A rule that lives only in `AGENTS.md` or `.ai/review.md` is **not** in a
   subagent trial's context. Stripping it from a worktree measures nothing —
   that is why the worktree-arms design this skill originally shipped with was
   void, and why `.ai/agents/kaine-implementer.md` duplicating guide rules is
   load-bearing rather than redundant.
2. The agent definition is frozen for the life of the session. Both arms cannot
   run in one session.

Re-run the probe whenever the agent runtime changes — this table is an
observation about one CLI version, not a contract:

```
Dispatch <agent> with: "Answer from your own injected system instructions only.
Use no tools. Does your context contain the exact phrase <marker>? Answer YES or
NO and nothing else."
```

Use two markers per probe: one you expect present (the positive control) and one
you stripped. A probe with no positive control cannot distinguish "stripped" from
"nothing is injected".

## Two constructions

### Installed-definition arms — two sessions, measures the shipped harness

What agents actually receive. Arm A is a normal session. For arm B, strip the
rule from `.ai/agents/<agent>.md`, run `pnpm ai:install --agent claude`, then
**start a new session** and dispatch there. Restore and reinstall afterwards.
Rules measurable this way are exactly the ones in the agent definition.

### Prompt-carried arms — one session, measures the carry-in instruction

`AGENTS.md` requires carrying the relevant rules into a subagent prompt, since a
subagent inherits none of the guide. Arm A includes the rule verbatim in the task
prompt, arm B omits it, everything else identical. This is the only construction
that runs in a single session, and it measures the carry-in practice rather than
the installed file. Say which construction a run used — the two are not
comparable.

## Which rules are worth measuring

Only rules whose efficacy is genuinely in doubt **and** that reach the trial
agent. A rule already enforced by lint, a test, or CI needs no eval.

1. **The verification close** (`.ai/agents/kaine-implementer.md`). Measures
   hallucination, the one dimension with unambiguous ground truth: every claim
   is checkable against the transcript's tool calls. Single occurrence in the
   definition, so the strip is clean. Metrics: `claimsMade`,
   `claimsWithToolCall`, `claimsWithout`, `skipsDisclosed`.
2. **Surgical changes** (`.ai/agents/kaine-implementer.md`). Mechanical from the
   diff. Metrics: `filesTouched`, `netLines`, `unrelatedEdits`.
3. **Boundary parsing over ad hoc `typeof` narrowing** (`.ai/review.md` Quality
   Gates). No lint rule backs it, and the gap audit counts roughly 61 ad hoc
   `typeof` sites and 43 conditional `{}` spreads as review-only. **Reachable
   only through prompt-carried arms** — `AGENTS.md:12` scopes `REVIEW.md` to
   reviewers, so no implementer definition carries it. Metrics: `typeofSites`,
   `conditionalSpreads`, `parserAtSeam`.

Rules in `.ai/guide.md` that no agent definition repeats — the simplicity ladder
and the root-cause rule among them — govern the main session, which cannot be
A/B'd because its context cannot be reset. Measure them by promoting the rule
into an agent definition first, or with prompt-carried arms, and say which.

Record focus-banner compliance across every trial as a by-product — it is a
substring check on the first line and costs nothing. Do not give it its own arm:
its claimed benefit is that a human notices drift, which an output eval cannot
measure.

Do not invent a rule to test. If nothing is in doubt, say so and stop.

## Workflow

1. Name the rule, the file it lives in, and the exact text arm B will strip.
   Quote it. Grep it across `AGENTS.md`, `.ai/review.md`, `.ai/agents/*.md` and
   the installed agent directories — arm B must strip every copy the trial can
   see.
2. Run the sentinel probe for both arms. Do not proceed on a probe without a
   positive control.
3. Build the arms by the construction you chose above. Pin the task's repo state
   with a `git worktree` at the commit under test and give the trial that
   absolute path, so a later merge cannot move the ground truth under the run.
4. Run the same task prompt three times per arm by dispatching the agent fresh
   each time. Never reuse a transcript across trials.
5. Score each trial against the rubric in `docs/agents/harness-evals.md` and
   collect the metrics the rule calls for.
6. Restore every stripped file, `pnpm ai:install`, and confirm
   `pnpm ai:doctor --strict` exits 0. Then append the run to the
   `harness-eval:data` block and render:

   ```bash
   pnpm harness:eval
   ```

7. Clean up the worktrees:

   ```bash
   git worktree list          # nothing named kaine-eval-* may remain
   git worktree remove <path>
   ```

8. Act on the result. `keep` needs no follow-up. `tighten` means the effect is
   real but weak — re-word the rule and say what changed. A **first** measured
   no-op records `tighten` with a note that one run cannot justify deletion, and
   files an issue for the second run; `delete` needs two no-op runs, and only
   then open a PR removing the rule. `promote-to-lint` means file an issue naming
   the rule and the check that replaces it. Acting is not optional — an eval
   nobody acts on is worse than no eval, because it costs the run and buys
   nothing.

## Reporting

State the rule, the file it was stripped from, the construction used, the
per-arm verdict means and the delta, the conclusion, and the action. Say plainly
that `n = 3` detects only large effects, and name the model, the agent and the
CLI version — a result for one does not transfer to another.
