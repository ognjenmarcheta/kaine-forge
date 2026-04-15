# Task Completion Checklist

Before considering a task complete:

- Confirm the changed files match the requested scope.
- Run `pnpm ai:sync` after editing `.ai/` sources.
- Run `pnpm ai:sync:check` when assistant files are involved.
- Confirm generated assistant outputs and Serena config are not edited directly.
- Run focused tests for the changed workspace.
- Run `pnpm generate` when GraphQL schema or operation documents changed.
- Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` for broad or template-level changes.
- Run `pnpm run build:core` when API or web runtime/build behavior changed.
- Mention any validation that could not be run.
