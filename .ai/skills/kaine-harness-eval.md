---
name: kaine-harness-eval
description: Measure whether a specific guide or review rule actually changes agent output, and record the verdict in the harness-eval ledger.
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
- **Never modify the tracked repo to build an arm.** Use `git worktree`.
- **Never invent a verdict.** Every trial row needs a transcript citation. If
  you did not run the trial, the row does not exist.

## Which rules are worth measuring

Only rules whose efficacy is genuinely in doubt. A rule already enforced by
lint, a test, or CI does not need an eval — it needs nothing. The first three,
in order:

1. **Boundary parsing over ad hoc `typeof` narrowing** (`.ai/review.md` Quality
   Gates). No lint rule backs it, and the gap audit counts roughly 61 ad hoc
   `typeof` sites and 43 conditional `{}` spreads as review-only. Task: parse an
   untrusted JSON config into a typed record. Metrics: `typeofSites`,
   `conditionalSpreads`, `parserAtSeam` (0 or 1). This is the most actionable of
   the three — a measured no-op is the evidence that justifies writing
   `no-runtime-typeof`, and a measured effect is the evidence it is not needed
   yet.
2. **The simplicity ladder** (`.ai/guide.md`). Highest-stakes rule in the guide
   and the hardest to know the value of. Task: add a second notification channel
   alongside email, where the ladder-correct answer is a second function and the
   ladder-free answer is a provider registry. Metrics: `netLines`, `newFiles`,
   `singleCallerAbstractions`, `namedRung`.
3. **The verification close** (`.ai/guide.md`). Measures hallucination, the one
   dimension with unambiguous ground truth. Metrics: `claimsMade`,
   `claimsWithToolCall`, `claimsWithout`, `skipsDisclosed`.

Record focus-banner compliance across every trial as a by-product — it is a
substring check on the first line and costs nothing. Do not give it its own arm:
its claimed benefit is that a human notices drift, which an output eval cannot
measure.

Do not invent a rule to test. If nothing is in doubt, say so and stop.

## Workflow

1. Name the rule and the exact text arm B will strip. Quote it.
2. Build the arms:

   ```bash
   git worktree add ../kaine-eval-with HEAD
   git worktree add ../kaine-eval-without HEAD
   ```

   In the `without` worktree, delete the quoted section from `AGENTS.md`. Change
   nothing else, and do not run `pnpm ai:install` there — it would put the
   section back.

3. Run the same task prompt three times per arm by dispatching
   `kaine-implementer` with the worktree as its working directory. Fresh
   dispatch each time; never reuse a transcript across trials.
4. Score each trial against the rubric in `docs/agents/harness-evals.md` and
   collect the metrics the rule calls for.
5. Append the run to the `harness-eval:data` block, then:

   ```bash
   pnpm harness:eval
   ```

6. Clean up:

   ```bash
   git worktree remove ../kaine-eval-with
   git worktree remove ../kaine-eval-without
   ```

7. Act on the result. `delete` means open a PR removing the rule from
   `.ai/guide.md`. `promote-to-lint` means file an issue naming the rule and the
   check that replaces it. Neither is optional — an eval nobody acts on is worse
   than no eval, because it costs the run and buys nothing.

## Reporting

State the rule, the stripped text, the per-arm verdict means and the delta, the
conclusion, and the action. Say plainly that `n = 3` detects only large effects,
and name the model and agent — a result for one does not transfer to another.
