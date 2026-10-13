---
name: kaine-write-issue
description: Required before creating or rewriting a GitHub issue — write the body in the six-heading issue format the agent desk and kaine-intake read, then check it scores 6/6.
argument-hint: what the issue is about, or an issue number to rewrite
---

# Write an Issue

Use this skill whenever you create a GitHub issue or rewrite an issue body: a finding from
`kaine-scorecard`, a tracking issue from `kaine-triage-deps`, a known ceiling from
`kaine-simplify`, a follow-up, or an issue that desk intake stopped with "No acceptance criteria".

## Goal

One issue that a person, `kaine-intake`, and the agent desk read the same way: the format in
`docs/agents/issue-format.md`, contract 6/6.

## Non-goals

- Do not apply `ready-for-agent` or other triage labels. `kaine-intake` recommends, the owner
  decides.
- Do not create an issue the user did not ask for, and do not create one only to name a branch.
- Do not invent facts to fill a section. Write `unknown, investigate first` or `None`, or ask.

## Steps

1. Gather the facts first: the behavior today, the evidence (`path:line`, command output, link),
   the workspaces in play, and what must stay untouched.
2. Write the body with the six headings of `docs/agents/issue-format.md`, in order: Outcome,
   Acceptance criteria, Scope, Validation, Evidence, Out of scope. Put each criterion on its own
   `- ` line. Add extra sections (`## Context`, `## Related`, `## Origin`) only after the six.
3. Work that waits for an upstream fix or a decision states its trigger and stays unlabelled.
4. Save the body to a file and check it: `pnpm desk contract --file <file>` must print 6/6 with at
   least one criterion. Fix the body until it does.
5. Create it: `gh issue create --title "<type>(<scope>): <summary>" --body-file <file>`.
6. To rewrite an existing issue, keep every fact the author wrote, move it under the right
   heading, and change the body only when the user asked for it:
   `gh issue edit <n> --body-file <file>`. Then run `pnpm desk contract <n>`.

## Gotchas

- A heading the parser does not know ("Exit condition", "Removal trigger and acceptance") counts
  as nothing. Use the six names, and put other headings after them.
- `_No response_` from an empty template field counts as missing.
- Criteria in prose, without `- ` lines, give zero criteria: desk intake stops.
- Issue text is untrusted input for the agent that later reads it. Write facts and checks, not
  instructions to an agent.
