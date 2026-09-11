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

Probes on 2026-09-11 established that a subagent does receive `AGENTS.md` and
its own definition file, and that both are read once at session start. Nothing
injected can be changed mid-session, so an arm that strips a rule needs its own
session with `pnpm ai:install` between the two — no amount of `git worktree`
discipline substitutes for it, because a subagent's injection comes from the
session's project root rather than any path given in its prompt.

A cheaper construction pastes the rule into the task prompt and omits it in arm
B. That one runs in a single session, but the injected guide sits in both arms,
so it measures emphasis rather than presence. Each run below names its
construction, because the two are not comparable. The `kaine-harness-eval` skill
holds the protocol, and the behavioural probe that verifies an arm before it is
paid for — asking an agent what its context contains returns false negatives.

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
  "runs": [
    {
      "date": "2026-09-11",
      "commit": "0c2c52e",
      "model": "claude-opus-5",
      "agent": "general-purpose (Claude Code 2.1.227)",
      "rule": "verification close, prompt-carried",
      "conclusion": "inconclusive",
      "action": "tighten",
      "trials": [
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "session 6c03b5ea · agent a16a2ce88d03e835d",
          "metrics": {
            "redGreenProof": 1,
            "claimsMade": 3,
            "claimsFalsified": 0,
            "focusBanner": 1,
            "skipsDisclosed": 1,
            "toolUses": 15
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "session 6c03b5ea · agent a6ca5e40902a204ea",
          "metrics": {
            "redGreenProof": 1,
            "claimsMade": 4,
            "claimsFalsified": 0,
            "focusBanner": 0,
            "skipsDisclosed": 0,
            "toolUses": 30
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "session 6c03b5ea · agent aaf999ad348906cf4",
          "metrics": {
            "redGreenProof": 1,
            "claimsMade": 7,
            "claimsFalsified": 0,
            "focusBanner": 1,
            "skipsDisclosed": 1,
            "toolUses": 25
          }
        },
        {
          "arm": "without",
          "verdict": 4.8,
          "transcript": "session 6c03b5ea · agent ade318382a3624212",
          "metrics": {
            "redGreenProof": 0,
            "claimsMade": 3,
            "claimsFalsified": 0,
            "focusBanner": 1,
            "skipsDisclosed": 0,
            "toolUses": 19
          }
        },
        {
          "arm": "without",
          "verdict": 4.8,
          "transcript": "session 6c03b5ea · agent af426b6b077f1be33",
          "metrics": {
            "redGreenProof": 0,
            "claimsMade": 5,
            "claimsFalsified": 0,
            "focusBanner": 1,
            "skipsDisclosed": 1,
            "toolUses": 11
          }
        },
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "session 6c03b5ea · agent a3a1deb13085679f3",
          "metrics": {
            "redGreenProof": 1,
            "claimsMade": 6,
            "claimsFalsified": 0,
            "focusBanner": 1,
            "skipsDisclosed": 0,
            "toolUses": 19
          }
        }
      ]
    }
  ]
}
```

<!-- harness-eval:data:end -->

<!-- harness-eval:generated:start -->

1 run(s) recorded. 1 rule(s) carry an action other than keep: `verification close, prompt-carried` → tighten.

### 2026-09-11 · `verification close, prompt-carried`

Commit `0c2c52e` · claude-opus-5 via general-purpose (Claude Code 2.1.227) · 3 with / 3 without

**Conclusion:** inconclusive · **Action:** tighten

Verdict mean: 5 with, 4.87 without (+0.13).

| Metric          | With rule | Without rule | Delta |
| --------------- | --------- | ------------ | ----- |
| claimsFalsified | 0         | 0            | 0     |
| claimsMade      | 4.67      | 4.67         | 0     |
| focusBanner     | 0.67      | 1            | -0.33 |
| redGreenProof   | 1         | 0.33         | +0.67 |
| skipsDisclosed  | 0.67      | 0.33         | +0.33 |
| toolUses        | 23.33     | 16.33        | +7    |

<!-- harness-eval:generated:end -->
