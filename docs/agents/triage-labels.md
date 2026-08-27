# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Canonical role    | Label in our tracker | Meaning                                  |
| ----------------- | -------------------- | ---------------------------------------- |
| `needs-triage`    | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`      | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human` | `ready-for-human`    | Requires human implementation            |
| `wontfix`         | `wontfix`            | Will not be actioned                     |

When a skill mentions a role, such as "apply the AFK-ready triage label", use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary this repo actually uses if labels change later.

## Bootstrapping the labels

GitHub labels are repository state, not files, so a repo generated from this template starts without them. Create the set once per repository:

```bash
gh label create needs-triage --description "Maintainer needs to evaluate this issue" --color d4c5f9
gh label create needs-info --description "Waiting on reporter for more information" --color fef2c0
gh label create ready-for-agent --description "Fully specified, ready for an AFK agent" --color c2e0c6
gh label create ready-for-human --description "Requires human implementation" --color bfdadc
```

(`wontfix` is a GitHub default label and already exists.) If a `gh issue create --label` call fails with "label not found", run the block above first.
