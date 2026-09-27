---
name: kaine-summarize-work
description: Write or revise implementation handoffs for completed, partial, or blocked code, configuration, and documentation changes, ending with a plain-language explanation of results and next steps.
argument-hint: implementation results or an existing handoff to summarize
---

# Summarize Implementation Work

## Goal and activation

Use this skill before the final handoff for implementation work, including delivery
through a pull request and partial or blocked implementation. Also use it when
explicitly invoked or when revising or shortening an implementation summary.
Reuse unchanged instructions if already loaded.

Keep the technical evidence useful and explain what the result means to a
nontechnical reader. Do not automatically apply this workflow to standalone
investigations, reviews, ordinary questions, or progress updates. Implementation
plans remain owned by `kaine-write-plan`.

## Workflow

1. Establish the actual result from the work and available evidence. Separate
   completed changes, verified behavior, unverified claims, and unfinished work.
2. Preserve the technical handoff: useful links, checks and their results, skipped
   checks and reasons, and material limitations. Distinguish implementation, PR
   creation, merge, and deployment; one does not establish the others.
3. End with **In plain language** using the guidance below. Keep this ending when
   revising or shortening the summary.
4. Check that both parts agree. Add no new promises or unsupported claims. Passing
   tests do not establish behavior outside their coverage.

## In plain language

Use this exact heading as the final section. Explain:

- What problem the changes addressed and what is better or different for the user.
- What remains incomplete or uncertain, if anything material remains.
- Whether the user needs to act, what to do, and when. Name who owns each necessary
  next step: the agent, the user, or an external review or check.

Lead with the practical result. Use familiar words, short sentences, and a
respectful tone. Explain necessary technical terms; preserve repository domain
names. A short paragraph is enough for a small change. Use a few bullets when they
make a larger result easier to understand. Avoid repeating test counts or file
lists from the technical handoff.

Say “No action is needed from you now” only when the evidence supports it. Do not
invent follow-up work, ask for repeated approval, or stop authorized implementation
early to produce a summary. This skill does not authorize publication, merge,
deployment, delegation, or other additional actions. Follow the active harness's
output rules and the user's requested format.
