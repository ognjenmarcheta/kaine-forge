---
name: kaine-product-review
description: Review an issue, idea, or plan from the product side before anyone builds it — challenge the premise, ask for evidence of demand, find the narrowest version that delivers the outcome, and recommend whether to expand, hold, or reduce scope. Not for code review (kaine-review) or issue readiness (kaine-intake).
argument-hint: issue number, plan, or a short description of the idea
---

# Product Review Workflow

Use this skill to decide whether a piece of work is worth doing, and in what size, before a plan or a build starts.

## Goal and non-goals

- Goal: a clear position on whether to build this, the narrowest version that delivers the outcome, and the scope decisions that follow.
- Do not plan files, write code, or judge code quality. `kaine-write-plan` and `kaine-review` own that.
- Do not grade agent readiness. `kaine-intake` owns that.
- Do not invent demand. Cite the evidence, or say that there is none.

## Read first

- `CONTEXT.md`, especially "Template platform surfaces". The users are template adopters and the end users of an adopter's product.
- `README.md` ("Is this the right template?") for who the template is for.
- The findings in `docs/agents/monorepo-scorecard.md`, and the issues and PRs that the target links to.

## Steps

1. **Name the user and the problem.** Say who has the problem: a template adopter, an adopter's end user, or the owner. State the problem in one sentence, without the solution in it.
2. **Check the evidence.** List what shows that the problem is real: an issue, a scorecard finding, a support question, or an owner request. Say "no evidence" when there is none.
3. **Cost of doing nothing.** Say what happens if nobody builds this for six months.
4. **What already exists.** Name the package, feature, script, or doc that already covers part of it. Reuse comes before new work.
5. **Narrowest version.** Describe the smallest change that delivers the outcome for the named user. List what it leaves out.
6. **Scope mode.** Recommend one mode and give the reason:
   - Expand: the request is too small to deliver the outcome.
   - Selective expand: add one or two items that change the result.
   - Hold: the scope is right.
   - Reduce: cut to the narrowest version. A change of more than 15 files, or one with a speculative option, usually needs this.
7. **Reversibility and the six-month view.** Rate reversibility from 1 (one-way door) to 5 (trivial to undo). Say whether this still matters in six months.

## Tone

- Take a position on each point, and say what evidence would change it.
- Do not hedge. Do not write "that could work", "an interesting approach", or "there are many ways to think about this".
- Respect the owner's decision. You recommend; the owner decides.

## Report

- Verdict: `proceed`, `narrow`, or `rethink`, with one sentence of reason.
- A scope table: each item with `keep`, `cut`, or `defer`, and the reason.
- Findings: the user, the evidence (or its absence), the cost of doing nothing, what already exists, the risks, and the reversibility.

## Headless runs (Agent Desk)

When the prompt supplies a result schema, fill the schema. Do not ask the user a question. Record each unknown as a finding, and state the default you chose. Put the plain-language ending in the schema's plain-language field. Do not print a banner or add any text outside the schema.
