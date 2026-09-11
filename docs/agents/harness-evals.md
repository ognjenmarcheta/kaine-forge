# Harness evals

Measures whether a specific rule in `.ai/guide.md` or `.ai/review.md` actually
changes agent output. `docs/agents/automation-gap-audit.md` has carried the same
admission since it was written: _"A guide rule can be a behavioral no-op —
present in the prompt but not changing agent output."_ This ledger is where that
stops being a guess for the rules it covers.

**This is not a gate.** It never runs in CI, in a hook, or in `pnpm initialize`.
A red arm blocks nothing. It is human-invoked through the `kaine-harness-eval`
skill, exactly like `kaine-scorecard`, because it measures judgment rather than
facts.

## How a run works

Both arms get the identical task prompt, `n = 3` each, and the verdicts and
metrics are recorded below by hand with a transcript citation. What differs
between the arms is one rule, removed from the one surface the trial agent
actually reads.

That surface is **not** `AGENTS.md`. Probes on 2026-09-11 established that a
`kaine-implementer` subagent receives its own definition file and not the
project instructions, and that the definition is read once at session start. So
a rule in an agent definition is measured across two sessions with
`pnpm ai:install` between them, and a rule that lives only in `.ai/guide.md` or
`.ai/review.md` is measured by carrying it into the task prompt, the way
`AGENTS.md` already requires for subagents. Each run below names its
construction, because the two are not comparable. The `kaine-harness-eval` skill
holds the protocol and the sentinel probe that verifies an arm before it is paid
for.

## What it can and cannot tell you

It can tell you whether a rule changes output, in which direction, with a
per-trial citation you can re-read; what the compliance rate is; and, for the
verification-close rule, a hard count of checks claimed without a matching tool
call — a real hallucination rate for this harness.

It cannot give significance at `n = 3`, generalize across models, agents or task
families, detect small effects, survive a model upgrade without a re-run, or say
whether a rule helps a _human_ read the repo — which is often the real reason a
rule exists. Weigh the `action` field accordingly.

## Rubric

Scored per trial, 1–5, against the paper's dimensions (task success, tool-use
quality, trajectory compliance, hallucination, response quality). The `action`
is the point of the exercise: a rule measured as a no-op twice is a rule to
delete from `.ai/guide.md`, not a rule to re-word.

| Action            | Meaning                                                      |
| ----------------- | ------------------------------------------------------------ |
| `keep`            | Measured effect, rule earns its tokens.                      |
| `tighten`         | Effect in the right direction but weak or inconsistent.      |
| `delete`          | No measurable effect across two runs. Remove the rule.       |
| `promote-to-lint` | Effect is real and mechanical. Encode it as a check instead. |

<!-- harness-eval:data:start -->

```json
{
  "schema": 1,
  "runs": []
}
```

<!-- harness-eval:data:end -->

<!-- harness-eval:generated:start -->

_No runs recorded yet. Run the `kaine-harness-eval` skill, then `pnpm harness:eval`._

<!-- harness-eval:generated:end -->
