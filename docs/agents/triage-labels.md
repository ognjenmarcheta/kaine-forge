# Triage Labels

The skills speak in terms of canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Canonical role    | Label in our tracker | Meaning                                  |
| ----------------- | -------------------- | ---------------------------------------- |
| `needs-triage`    | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`      | `needs-info`         | Waiting on reporter for more information |
| `needs-spec`      | `needs-spec`         | Requires a reviewed specification        |
| `ready-for-agent` | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human` | `ready-for-human`    | Requires human implementation            |
| `wontfix`         | `wontfix`            | Will not be actioned                     |

When a skill mentions a role, such as "apply the AFK-ready triage label", use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary this repo actually uses if labels change later.

## What `ready-for-agent` requires

`ready-for-agent` says "fully specified". An issue is fully specified when it
carries all six of these. Missing any one makes it `needs-info`, not
`ready-for-agent`.

1. **One named outcome**, stated as observable behaviour rather than a task.
2. **At least one acceptance criterion** the agent can check without asking a
   human.
3. **Scope**: the workspaces or paths in play, or an explicit "unknown —
   investigate first".
4. **A validation tier** from `docs/agents/day-one.md` §5, so the agent knows
   which checks close the loop.
5. **Evidence**: a `path:line`, command output, or a reproduction. The same bar
   `kaine-scorecard` applies before it files anything.
6. **Anything deliberately out of scope**, named — so the agent does not widen
   the change to be helpful.

## Bootstrapping the labels

GitHub labels are repository state, not files, so a repo generated from this template starts without them. Create the set once per repository:

```bash
gh label create needs-triage --description "Maintainer needs to evaluate this issue" --color d4c5f9
gh label create needs-info --description "Waiting on reporter for more information" --color fef2c0
gh label create needs-spec --description "Requires a reviewed specification" --color d4c5f9
gh label create ready-for-agent --description "Fully specified, ready for an AFK agent" --color c2e0c6
gh label create ready-for-human --description "Requires human implementation" --color bfdadc
```

(`wontfix` is a GitHub default label and already exists.) If a `gh issue create --label` call fails with "label not found", run the block above first.

## Agent execution labels

The agent desk ([`agent-desk.md`](agent-desk.md)) shows where a run stands with three
labels. They are separate from the triage labels above.

| Label             | Meaning                                       |
| ----------------- | --------------------------------------------- |
| `agent:working`   | The agent desk is working on this issue       |
| `agent:needs-you` | The agent desk waits for the repository owner |
| `agent:pr-open`   | The agent desk opened a draft pull request    |

- An issue has at most one of these labels. The desk removes the others when it sets one.
- The desk never adds or removes a triage label. `ready-for-agent` stays under human control.
- Label writes are best effort. If a label is missing, the desk logs it and goes on.

Create the labels once per repository. This prints the commands and changes nothing:

```bash
pnpm desk labels sync
```

Add `--apply` to run them. The commands use `--force`, so a second run updates the
color and description.
