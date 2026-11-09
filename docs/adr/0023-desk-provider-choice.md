# ADR 0023: Desk provider choice

- Status: Accepted
- Date: 2026-11-03
- Applies to: `tooling/desk/src/agents/provider.*.ts`

## Context

The agent desk (ADR 0011, ADR 0012) runs each role on a fixed provider CLI. The config defaults are Claude for intake, planner, and builder, and Codex for the reviewer. Nothing checked that the CLI exists before a run, so a machine without Codex stopped every issue at review with `spawn codex ENOENT` (issue #848). Desk jobs (ADR 0021) ran only on Claude.

The owner's rule: a missing provider must never stop work. When one provider runs, every role uses it. When several run, the desk picks the best one for each role.

## Decision

Before each agent run, the desk chooses the provider from the CLIs that run on the machine.

- `agents/provider.probe.ts` runs `<cli> --version` and checks the required flags in its help, as `desk doctor` did. The server and the CLI cache the result for 60 seconds. The doctor uses the same probe.
- `agents/provider.choose.ts` keeps the provider the config or the agent file asks for when its CLI runs. Otherwise it takes the best other one by a fixed ranking per role. The reviewer ranks Codex, Claude, OpenCode and avoids the builder's provider when it has a choice, so a review stays a second opinion. Intake, planner, and builder rank Claude, Codex, OpenCode.
- A run that moves drops the model of the provider it asked for, starts a new session, and writes a `provider-moved` note to the issue history. A desk job writes the note to the job history.
- A spawn that still finds the CLI missing leaves that CLI out, and the run chooses once more.
- The run stops at `needs-you` only when no provider can run the step.
- Codex changes code only with the new config opt-in `allowCodexBuilder`, which Setup offers as the fix **Allow Codex to build**. This is the opt-in that ADR 0011 asked for. Read-only roles run on Codex without it. A job that writes files on Codex runs with the builder role, so the Codex runner gives it the `workspace-write` sandbox.
- OpenCode runs only where a role names it with a `provider/model` model, because it has no default model. It is never a fallback.
- `desk doctor` reports a missing provider as a warning that says where its roles run. The **Agent roles** row is an error only when a role has no provider.

## Alternatives Considered

- One global ranking for every role: simpler, but the reviewer would often be the same model as the builder.
- An explicit provider choice that stays strict: the owner wants work to go on, with a note, rather than stop.
- Codex builds on the host with no opt-in when it is the only CLI: it would remove the guard of ADR 0011 without the owner's consent.
- A ranking the owner sets in the config: no need yet. The config already sets the first choice per role.

## Consequences

- Pros:
  - An issue or a job runs on any machine that has one working agent CLI.
  - The owner sees each move in the history and in `desk doctor`.
- Cons:
  - The budget cap of a job holds only on Claude (`--max-budget-usd`). On Codex or OpenCode only the time limit holds, and the job history says so.
  - A moved run loses the session of the provider it asked for, so a resumed planner or builder starts a new session.
  - The probe adds two short commands per CLI at most once a minute.
