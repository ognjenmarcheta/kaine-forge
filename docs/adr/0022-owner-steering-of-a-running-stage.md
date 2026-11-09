# ADR 0022: Owner steering of a running stage

- Status: Accepted
- Date: 2026-11-03
- Applies to: `tooling/desk/src/engine/pipeline.agent.ts`, `tooling/desk/src/engine/pipeline.types.ts`

## Context

The agent desk (ADR 0011, ADR 0012) works as a software factory. It drives an issue from intake to a draft PR, and the owner decides only at gates: the plan gate and the PR review. While an agent runs, the owner can watch its live events, pause the issue after the stage, or cancel it. The owner cannot correct an agent in the middle of a stage. An agent that goes the wrong way in a 40-minute build runs to its end or is cancelled, and a cancel throws away its context.

Agentic development environments (Warp, the ADE project, JetBrains Air) let the human work with the agents while they run. The owner decided to grow the desk into that mode inside this template, not as a separate product. The desk stays one engine with one state store and one UI, and it has two modes on the same issue: the factory drives by itself, and the owner may step in at any time.

Every runner already resumes a session by id: Claude `--resume`, Codex `exec resume`, OpenCode `--session`. The issue detail already prints the command that resumes a session in a terminal (`agent.resume.ts`).

## Decision

The owner can reach the agent that runs now, with two actions.

- **Steer** (`steer`, with a note). The engine stops the agent process and at once runs the same agent again in the same session. The new run reads only the owner's note and the instruction to finish the same task and return the same result. The flags, schema, permissions, skills, and time limit stay those of the first run. Without a session id (the agent stopped before it had one), the agent starts again with the note after its prompt. The action answers at once with `stop: "steered"`.
- **Take over** (`take-over`). The engine stops the agent process, and the stage ends in `needs-you` with the session id in the issue state. The issue card and `pnpm desk resume <n>` show the resume command. The reason names only `pnpm desk resume <n>`, because it reaches the GitHub status comment. The owner works in the session in a terminal. **Continue** or **feedback** to the step hands it back: the step's next run resumes that session. No new action and no new state field are needed for the hand back.

Rules:

- Both actions act only on an agent that runs in this desk process (`OwnerChannel` in `pipeline.types.ts`, armed by `runAgentStage` in `pipeline.agent.ts`). Like `pause`, they never wait behind the running action in the server.
- The owner's note is the owner's own words. It goes in the prompt outside the untrusted fence, it is bounded like feedback (`MAX_FEEDBACK_CHARS`), and it is appended to the issue's feedback artifact.
- The engine invariants cover the steered runs as one run: refs, the read-only diff, skill evidence (over the trace of all runs), denials, and the plan scope. `runs.jsonl` gets one record with `steers`.
- After a take over, the owner's edits count as the worktree's state. The builder's plan scope still applies to the whole diff, so an edit outside the plan's files fails the next build's verification.
- Take over is limited to agents that resume their session (plan and change agents). A review or report agent starts fresh on each run, so the owner steers it instead.
- Take over is refused under Docker isolation: the session lives in the container's auth volume, which a host terminal cannot reach. Steer works there, because the engine runs the resumed agent in the container.

## Alternatives Considered

- Claude's `--input-format stream-json`, which lets a run take user messages while it runs: Claude only, and it changes how every Claude run is started. Stop and resume works the same for all three runtimes and in Docker.
- A `takenOver` field in the issue state and a separate `hand-back` action: the existing `needs-you` stop, the stored session, and `continue` or `feedback` already do this.
- An embedded terminal in the desk UI: a large security surface on a loopback server. The owner uses their own terminal with the printed command.

## Consequences

- Pros:
  - The owner can correct an agent without losing its context, and can do part of the work by hand and give the session back to the factory.
  - It works for Claude, Codex, and OpenCode, with no change to the runners.
- Cons:
  - A stopped run reports no cost. `runs.jsonl` records the cost of the last run only.
  - The CLI cannot steer: a CLI process cannot reach an agent that another desk process runs. Steering is a desk UI and HTTP API action.
  - Take over does not work under Docker isolation, and desk jobs (ADR 0021) do not offer either action yet.
