---
name: kaine-setup-github
description: Set up or check a repository's GitHub state (labels, Discussions, merge settings, security, rulesets, Projects board) from .github/repo-setup.json with pnpm github:setup — after creating a repo from the template, or when labels, rulesets, or the board drift.
argument-hint: optional sections, e.g. labels,rulesets
---

# Set Up GitHub

A repository created from the template gets files, not settings. `.github/repo-setup.json` is the desired GitHub state; `pnpm github:setup` compares it with the live repository and applies the difference with the `gh` CLI. The command works the same on Windows, macOS, and Linux and needs only Node and `gh`.

**Goal:** `pnpm github:setup --check` exits 0 for the repository.

**Non-goals:** do not change repository visibility, secrets, or Actions variables. Do not delete labels, rulesets, or projects; the command never does. Do not edit `.github/repo-setup.json` to make a check pass unless the owner asks for that change.

## Workflow

1. Check the tools: `gh --version` and `gh auth status`. The signed-in account must be the repository owner or an admin. If `gh` is missing, send the owner to https://cli.github.com.
2. Run the dry run: `pnpm github:setup` (or `--only <sections>` from the argument). Show the owner every `would change`, `manual`, and `warn` line.
3. Ask the owner for a clear yes before you apply. Then run `pnpm github:setup --apply`. The guard hook asks for this command on Claude, Cursor, and OpenCode.
4. Handle each `warn`:
   - `gh needs the project scope`: the owner runs `gh auth refresh -s project`. It opens a browser, so the owner must do it. Then run step 2 again for the `project` section.
   - `needs repository admin rights`: stop. The owner runs the command.
   - `not available for this repository or plan`: report it. Rulesets and some security features need a public repository or a paid plan.
5. For each `manual` section, give the owner its printed steps as they are: the link to open, then one numbered click per line, then how to confirm. GitHub has no API for these steps: missing discussion categories, and the board workflows (Auto-add to project, Item added to project). Do not shorten the steps into one sentence, and do not do them in a browser for the owner.
6. Wait until the owner says the steps are done. Then run `pnpm github:setup --check`. Done when it exits 0.
7. If the check still lists a board workflow, the owner most likely did not click **Save and turn on workflow**, so the workflow stayed off. Ask the owner to open that workflow, check that it shows **On**, and click **Save and turn on workflow** again. Then run step 6 again.

## Gotchas

- `pnpm preflight` fails on a fresh repository while the labeler labels are missing. `pnpm github:setup --apply --only labels` fixes it.
- `pnpm desk labels sync --apply` creates only the three `agent:*` labels. This command creates every label in the file, and a desk test keeps both definitions equal.
- Rulesets match by name. Rename a ruleset in `.github/rulesets/` and the command creates a second one; delete the old one by hand.
- When the command changes the board's Status options, GitHub turns off a workflow whose Status target was removed (for example `Todo`). The command then prints the workflow steps again, even for workflows that were on before.

## Canonical commands

```bash
pnpm github:setup                      # dry run
pnpm github:setup --apply              # apply; owner's yes first
pnpm github:setup --check              # exit 1 while anything differs
pnpm github:setup --only labels,project
gh auth refresh -s project             # owner only; opens a browser
```
