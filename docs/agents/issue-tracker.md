# Issue Tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in `ognjenmarcheta/kaine-forge`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: write the body with the `kaine-write-issue` skill in the format of [`issue-format.md`](issue-format.md), check it with `pnpm desk contract --file <file>`, then `gh issue create --title "..." --body-file <file>`.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside this clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
