# ADR 0012: Configurable flows and agents

- Status: Accepted
- Date: 2026-10-22

Supersedes in part [ADR 0011](0011-local-agent-desk.md): its fixed layout of one planner, one
builder, one reviewer, and two gates. Every other decision of ADR 0011 stands.

## Context

The agent desk (ADR 0011) ran one fixed pipeline: intake, setup, plan, plan gate, build, check,
review, PR review, ship, and the open PR. The stages were a hard-coded switch in the engine. The
roles were hard-coded too: the planner, the builder, and the reviewer had fixed prompts in
`tooling/desk/agents/<role>.md`, fixed permission lists, and fixed skills. The config could
change only the provider and the model of a role.

The owner wants other shapes of work: a docs-only flow, an extra review, a report agent after
the review, or a flow that ships without the second gate. Each one needed engine code. The safety
rules (refs checks, the ship gate, isolation, the permission floor) must hold for every shape.

## Decision

Agents and flows are data, and one interpreter runs them.

- **Definitions as data.** An agent is a Markdown file with YAML frontmatter (`<id>.md`): id,
  name, description, provider, optional model, output kind, capabilities, optional time limit,
  and the prompt as the body. A flow is a YAML file (`<id>.yaml`): an ordered list of steps of
  five kinds (`agent`, `gate`, `check`, `ship`, `pr-wait`). Zod schemas
  (`src/contracts/agent-definition.contract.ts`, `src/contracts/flow-definition.contract.ts`)
  and one pure validator (`src/contracts/flow-definition.validate.ts`) check them in the engine
  and in the browser. The built-in definitions in `tooling/desk/defaults/` are today's pipeline:
  the `kaine-default` flow and the `intake`, `planner`, `builder`, and `reviewer` agents.
- **Local first, then promote.** The registry (`src/registry/`) reads three sources: built-in
  (read-only), repo (`.desk/`), and local (`.ai.local/desk/`). A later source overrides an
  earlier one by id. The desk saves to local only. Promote copies a local file to `.desk/`, and
  the owner reviews and commits it. The desk never commits a definition. Delete removes local
  files only, and it refuses an agent that a flow uses.
- **Interpreter over snapshots.** At Start the desk freezes the flow and its agents into a flow
  snapshot with a hash, stored in the issue state. A pure interpreter
  (`src/engine/pipeline.machine.ts`) moves the issue through the snapshot's steps. A later edit
  of a definition never changes a running issue.
- **Output kinds.** An agent's output kind (`plan`, `change`, `review`, `report`, `intake`)
  selects its result schema and its step handler. The engine keeps every check it had for the
  old roles: read-only agents keep the diff unchanged, a change agent changes only planned
  files, and a review decides whether the work goes back.
- **Presets and a policy floor.** An agent picks a preset (`read-only`, `run-checks`,
  `edit-code`) and names MCP servers and skills. One pure resolver
  (`src/agents/capabilities.resolve.ts`) turns that into what a run gets. The policy floor always
  applies, and an agent can only narrow it. Every removal is recorded with its reason. A
  code-editing agent always runs in the configured isolation. Codex gets its sandbox only and
  no MCP server. Each run records its capability receipt. The built-in agents resolve to exactly
  the old permission lists.
- **One path, loop-backs, no parallel steps.** A flow is one ordered path. A step may loop back
  to an earlier step with a budget, a gate names the steps that feedback may go to, and the
  `pr-wait` step sends PR feedback back. Steps never run in parallel.
- **Ship stays the engine's.** A ship needs an owner approval at a gate of the flow, or an
  explicit `auto: true` on the ship step. An automatic ship still passes every technical guard of
  the ship gate and opens a draft PR only. The owner merges every PR.

## Alternatives Considered

- Keep the fixed pipeline and add config switches: every new shape would still need engine code
  and a new switch.
- A general workflow engine with branches and parallel steps: more states to prove safe, and no
  flow the owner needs today uses them.
- Edit definitions in place in `.desk/`: an unreviewed change would reach the whole team at once.

## Consequences

- Pros:
  - A new shape of work is a reviewed data file, not engine code.
  - Each issue keeps the definitions it started with, and the header shows the snapshot hash.
  - The capability receipt shows what each run actually got, and why something was removed.
- Cons:
  - The issue state moves to version 2 (flow snapshot, loop counts by step, sessions by agent).
    The desk migrates a version 1 file on read onto the built-in flow.
  - Ship writes the PR summary and the changeset from `plan.json`, so a flow that ships needs a
    plan agent before the ship step. The validator enforces it.
  - An agent can name only skills with the `kaine-` prefix. Setup and the prompt builder refuse
    any other name.
  - The validator, the interpreter, and the UI editor must change together when a step kind or
    a rule changes.

See [agent-desk.md](../agents/agent-desk.md) ("Agents and flows") and
[agent-desk-api.md](../agents/agent-desk-api.md) ("Agents and flows").
