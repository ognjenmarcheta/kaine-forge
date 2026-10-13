# Issue format

Every GitHub issue in this repository uses one body format. People, skills, the issue templates,
and the agent desk all share it. The desk reads an issue at intake with `parseContract`
(`tooling/desk/src/github/github.contract.ts`). An issue in this format scores **contract 6/6**
there, and `kaine-intake` can judge it without guessing.

The six sections are the `ready-for-agent` contract of
[`triage-labels.md`](triage-labels.md#what-ready-for-agent-requires). This page fixes their
headings.

## The body

Use these six headings, in this order, with exactly this text. Any heading level works (`##` or
`###`).

```markdown
## Outcome

One observable behavior that is true when the work is done. Not a task list.

## Acceptance criteria

- A statement an agent can check without asking a person.
- One per line, each line starts with "- ".

## Scope

The workspaces or paths in play, for example `apps/api`, `tooling/desk`. Or: unknown, investigate first.

## Validation

A tier from docs/agents/day-one.md section 5, and the commands, for example `pnpm check`.

## Evidence

A `path:line`, command output, a link, or a reproduction that shows the gap today.

## Out of scope

- What an agent must not change, named. Or: None.
```

- **Extra sections go after the six**, for example `## Context`, `## Why it matters`,
  `## Suggested fix`, `## Related`, or `## Origin`. The desk ignores them. The agent still reads
  them as context.
- **No section stays empty.** An empty section, or `_No response_` from a template, counts as
  missing. Write `unknown, investigate first` or `None` when that is the truth. Never invent a
  fact to fill a section.
- **Acceptance criteria are a list.** The desk turns each `- ` line into a check that the
  planner must cover. Prose without items there gives zero criteria, and intake stops.
- **The title** follows the Conventional Commit style of the repository, for example
  `fix(deps): remove the node-forge audit exception`.

## Work that waits for something

Some issues track work that cannot start yet, such as an upstream fix or a decision. Write them
in the same format. State the trigger in `## Outcome` or in an extra `## Blocked by` section, and
do not label them `ready-for-agent` until the trigger has happened.

## Check a body

The desk reports what intake will read. The command changes nothing.

```bash
pnpm desk contract --file body.md
```

```bash
pnpm desk contract 457
```

It prints the score, the missing sections, and the number of acceptance criteria. It exits 0 only
for 6/6 with at least one criterion.

## Where the format is enforced

- The issue templates in `.github/ISSUE_TEMPLATE/` have one field for each section.
  `github.contract.templates.test.ts` renders each template and fails below 6/6.
- The same test checks the example on this page.
- Skills that write issues use `kaine-write-issue`.
