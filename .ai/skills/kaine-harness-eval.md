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
  behavioural probe below before spending a single trial. Stripping a file that
  is not in the trial's context, or editing one mid-session, buys a guaranteed
  null result at full price.
- **Never invent a verdict.** Every trial row needs a transcript citation. If
  you did not run the trial, the row does not exist.
- **Restore before you record.** Put back every file you stripped, then confirm
  `pnpm ai:doctor --strict` exits 0 and `git status` is clean.

## What a trial agent can see

Measured 2026-09-11 against subagents dispatched from a Claude Code 2.1.227
session:

| Surface                                                 | In the trial's context | Editable mid-session           |
| ------------------------------------------------------- | ---------------------- | ------------------------------ |
| `AGENTS.md` / `CLAUDE.md` project instructions          | yes                    | **no** — read at session start |
| `.ai/agents/<agent>.md`, installed to `.claude/agents/` | yes                    | **no** — read at session start |
| `.ai/review.md` / `REVIEW.md`                           | no — not `@`-imported  | n/a                            |
| the task prompt you write                               | yes                    | yes                            |

One consequence decides the whole method: **everything injected is frozen at
session start.** A file edited mid-session reaches no agent dispatched
afterwards, so the two arms cannot both run in one session. The worktree-arms
design this skill originally shipped with was void for a second reason too — a
subagent's injection comes from the session's project root, and no dispatch
parameter can point it at a worktree path.

The guide reaching subagents also means the injected copy sits in **both** arms
of a prompt-carried run. Such a run measures the marginal effect of pasting a
rule the agent already has, not the rule itself. Say so in the record.

### Probe behaviourally, never by introspection

Asking an agent whether its context contains a phrase does not work. A probe run
on 2026-09-11 returned `NO` for a rule that the same agent then demonstrably
followed, and returned the same `NO` whether the rule was stripped or present —
a false negative in both directions that briefly inverted this whole table.

Probe with a rule whose compliance is **visible in the output** instead, and
give the trial no tools so it cannot read the file from disk:

```
Dispatch <agent> with a substantive no-tool question, e.g. an architecture
tradeoff in this repo. Then check the response for compliance with a rule that
exists only in the surface under test — the focus banner and the repo's named
anti-patterns both work. Compliance with zero tool calls proves injection.
```

To test whether the injection is _fresh_, append a behavioural sentinel to the
surface (`Begin every response with the line <TOKEN>`), dispatch, and look for
the token. Absent sentinel plus present banner means injected but frozen.

## Two constructions

### Injected-surface arms — two sessions, measures the rule itself

The only construction that removes a rule from the trial's context. Arm A is a
normal session. For arm B, strip the rule from `.ai/guide.md` or
`.ai/agents/<agent>.md`, run `pnpm ai:install`, then **start a new session** and
dispatch there. Restore and reinstall afterwards. This is the construction to
use when the question is whether a rule earns its tokens.

### Prompt-carried arms — one session, measures the carry-in instruction

Arm A pastes the rule verbatim into the task prompt, arm B omits it, everything
else identical. Runnable in one session, but the injected guide sits in both
arms, so the answer is about emphasis rather than presence — use it to decide
whether pasting a rule is worth the prompt space, or to test a **candidate**
rule the repo has not adopted, where arm B is genuinely clean. Say which
construction a run used; the two are not comparable.

## Which rules are worth measuring

Only rules whose efficacy is genuinely in doubt **and** that reach the trial
agent. A rule already enforced by lint, a test, or CI needs no eval.

1. **The simplicity ladder** (`.ai/guide.md`). Highest-stakes rule in the guide
   and the hardest to know the value of. Needs injected-surface arms. Task: add
   a second notification channel alongside email, where the ladder-correct
   answer is a second function and the ladder-free answer is a provider
   registry. Metrics: `netLines`, `newFiles`, `singleCallerAbstractions`,
   `namedRung`.
2. **Fix bugs at the root cause** (`.ai/guide.md`). Ground truth is mechanical:
   count the sibling callers a trial found. Needs injected-surface arms. Task:
   report one symptom of a defect that has several call sites and score the
   diff. Metrics: `sitesFixed`, `sharedFunctionUsed`, `siblingCallersFound`,
   `reportedPathOnly`.
3. **Boundary parsing over ad hoc `typeof` narrowing** (`.ai/review.md` Quality
   Gates). No lint rule backs it, and the gap audit counts roughly 61 ad hoc
   `typeof` sites and 43 conditional `{}` spreads as review-only. `REVIEW.md` is
   not `@`-imported, so this is the one candidate whose **prompt-carried** arm B
   is genuinely clean. Metrics: `typeofSites`, `conditionalSpreads`,
   `parserAtSeam`.

The verification close was measured on 2026-09-11 (prompt-carried,
`inconclusive` → `tighten`). Re-measure it with injected-surface arms before
touching the rule itself.

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
2. Run the behavioural probe for both arms. Do not proceed on a probe without a
   positive control, and never on an introspection answer.
3. Build the arms by the construction you chose above. Record the commit the
   trials ran against — a `git worktree` pin is the cleaner record, but it has
   no `node_modules`, so a trial cannot run `pnpm test` inside one. When the
   task's own verification matters, run the trials against the repo itself and
   `git checkout --` the touched paths between them, on a clean tree.
4. Run the same task prompt three times per arm by dispatching the agent fresh
   each time. Never reuse a transcript across trials. Verify every mechanically
   checkable claim a trial makes by reproducing it — suite counts, file scope,
   insertion counts, exit codes. A claim you did not reproduce is not scored.
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
