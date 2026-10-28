This board tracks the repository's open issues and pull requests. `pnpm github:setup` builds it from `.github/repo-setup.json`; change that file, not the board, so every copy of the template stays the same.

## Views

- **Board**: every item, in one column per Status.
- **Triage**: open items that wait for a decision (`needs-triage`, `needs-info`, `needs-spec`).
- **Ready**: open items that are ready for work (`ready-for-agent`, `ready-for-human`), highest Priority first. The agent desk takes its work from here.
- **Agent desk**: open items that the agent desk works on now (`agent:working`, `agent:needs-you`, `agent:pr-open`).

## Status

| Status      | Meaning                                                  |
| ----------- | -------------------------------------------------------- |
| Triage      | New. The owner has not decided what to do with it.       |
| Ready       | Fully specified. A person or the agent desk can start.   |
| In progress | Work has started.                                        |
| In review   | A pull request is open.                                  |
| Done        | Closed or merged. Items archive two weeks after closing. |

New issues and pull requests arrive in Triage. Labels decide the Triage, Ready, and Agent desk views; Status decides the Board columns. The agent desk changes labels, not Status, so move a card when its label changes.

## Fields

- **Priority**: P0 is urgent, P1 is next, P2 is later.
- **Size**: XS to XL, a rough estimate of the work.
