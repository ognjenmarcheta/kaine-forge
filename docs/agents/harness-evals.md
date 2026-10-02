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

## Explanation candidate pilot — October 2, 2026

The user requested this pilot while implementing `kaine-explain`. It measures a
candidate supplied in the task prompt, not native automatic skill selection.
Both arms share the original startup guidance and matching raw source excerpts at
`fade54b6089a35c08280609a4799d3b755f3670c`. Fresh desktop subagents use
`fork_turns=none`, with unchanged inherited model settings. Only packet intake
and response saving are permitted tool actions. No application tests run in a
trial. The exact backend model ID, reasoning value, desktop build, and per-trial
token usage are not exposed; they are unavailable, not zero. The installed CLI
`0.154.0` rejected the configured `gpt-6.1-sol` model, produced no answer, and
was not used for scored trials. These results do not transfer to that CLI.

Zero-tool probes produced the focus banner in both arms and the final plain-language
section only in the candidate arm. Their transcripts are
`/root/explain_probe_baseline` and `/root/explain_probe_candidate` in chat
`01a0fd51-e8ca-7f42-af7a-054174c60d8f`. Five preliminary responses are excluded
because packet intake could truncate. The scored trials use compact, frozen
packets and explicit output budgets. No shared instruction surface was stripped;
the authorized implementation changes remain in the working tree.

The frozen source packet SHA-256 is
`c3f1fd962462f2cce5f8b5f9741c8fdbbee480c571aa5f5cbcde9645e0ed154f`.
The supplied current prose/framing/verification excerpt SHA-256 is
`d408bd03d60a67a6ac8af2f4f91589b9c92420f4003a23c5bb601d507a021a3b`.
The tested routing-plus-candidate SHA-256 is
`8d69685a0ac547f08d23bd8bdd33ccb37142325765fa2eb23171d9b9109f933b`.
Packets, unedited responses, timings, and configuration are local ignored evidence
under `.ai.local/explain-eval/2026-10-02/`; they are not included in a checkout.
Each trial below also cites its actual subagent transcript in the parent chat.

The evaluator inspected all 18 responses against the real sources and checked
every linked file and line bound. No factual or link errors were found. All trials
receive 5 for the shared task: a correct, complete explanation with relevant
evidence and retained uncertainty. The candidate-only ending is a separate metric,
not a reason to penalize the baseline. Per-arm verdict means are 5 and 5, delta 0.
The `effect` conclusion concerns output structure: 9/9 candidate replies end with
In plain language versus 0/9 baseline replies; 3/3 candidate flow replies include
Mermaid versus 0/3 baseline flow replies. It does not establish reader benefit.

| Task family            | Mean baseline words | Mean candidate words |
| ---------------------- | ------------------: | -------------------: |
| Hidden Organization UI |                 205 |                  252 |
| Todo creation flow     |                 419 |                  530 |
| Uncertain creation     |                 269 |                  370 |

Words are whitespace-separated units, including Markdown and code. Elapsed time
runs from parent dispatch to the saved response timestamp and includes scheduling,
packet intake, and saving. It is not isolated generation latency or a cost estimate.
`n = 3` per arm per family is a small pilot; it does not establish significance,
productivity gain, or an effect across models, task families, or readers.

Action: tighten. Candidate flow replies 1 and 2 repeat the diagram's sequence in
prose, and candidate replies are longer in every family. The final skill now asks
the diagram to carry the sequence and prose to supply evidence and exceptions.
It also forbids expanding the main answer to fill an ending. The 18 scored trials
evaluate v1 before this correction; focused composition and HTML acceptance check
the final wording separately. A full repeated comparison of the final wording
has not run.

Final-wording acceptance is separate from the pilot. The transcript
`/root/explain_composition_acceptance` in the same parent chat contains five
fixtures: a documentation plan, a synthetic security review, a hypothetical
handoff, a small factual answer, and an explanation with missing evidence. The
evaluator read all five, checked their source links, and confirmed the owning
workflow content and evidence limits. All four substantive fixtures close with
In plain language; the short answer has no extra section or artifact. The plan
fixture ran in Default mode, so it does not test a native Plan-mode wrapper.

The `/root/explain_html_acceptance` transcript produced the ignored local
`.ai.local/explain/uncertain-todo.html` fallback. Its scenarios separate a lost
creation response from confirmed creation with a successful or failed list
refresh. The server outcomes are labeled illustrative premises, not live facts.
The evaluator inspected the final HTML and desktop screenshot and independently
ran `node .ai.local/explain-eval/html-check.cjs` using installed Playwright Chromium.
It passed three scenarios, both hidden premises, stage buttons and keyboard
controls, source links, visible focus, dark theme, reduced-motion emulation, and
overflow checks at 320, 375, 544, 768, and 1100 pixels. No browser errors or external
requests occurred. With JavaScript disabled, the practical guidance and source
evidence remain readable. The script, screenshot, and result JSON are local ignored
evidence. This verifies one fallback artifact; it does not establish inline-renderer
behavior, live request outcomes, or reader benefit.

Reader check: one unedited trial-1 pair per family was presented with independently
randomized A/B order, two comprehension questions, and a clarity preference. The
reader preferred the baseline for hidden Organization UI and the candidate for
the Todo creation flow and uncertain creation. All three preferences are recorded;
reader comprehension was not assessed. At the reader's request, the agent then
supplied the six answers and its own A/B selections. Those are model judgments,
not reader comprehension scores; the answer key is now visible to the reader.
The reader can see the formats and has prior task context; this is not a blinded
learning or timing experiment. Raw preference replies and randomization are
recorded in local reader artifacts.

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
    },
    {
      "date": "2026-10-02",
      "commit": "fade54b6089a35c08280609a4799d3b755f3670c",
      "model": "desktop subagents, inherited parent; exact backend identifier not exposed",
      "agent": "Codex desktop collaboration, fresh fork_turns=none; desktop build not exposed",
      "rule": "kaine-explain candidate v1, prompt-carried: visibility",
      "conclusion": "effect",
      "action": "tighten",
      "trials": [
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "/root/explain_visibility_a1 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/visibility-without-1.md",
          "metrics": {
            "chars": 1896,
            "words": 195,
            "durationMs": 43923,
            "sourceLinks": 6,
            "sourceLinkErrors": 0,
            "plainEndingLast": 0,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "/root/explain_visibility_a2 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/visibility-without-2.md",
          "metrics": {
            "chars": 2225,
            "words": 222,
            "durationMs": 44363,
            "sourceLinks": 8,
            "sourceLinkErrors": 0,
            "plainEndingLast": 0,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "/root/explain_visibility_a3 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/visibility-without-3.md",
          "metrics": {
            "chars": 2046,
            "words": 198,
            "durationMs": 56684,
            "sourceLinks": 7,
            "sourceLinkErrors": 0,
            "plainEndingLast": 0,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "/root/explain_visibility_b1 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/visibility-with-1.md",
          "metrics": {
            "chars": 2536,
            "words": 245,
            "durationMs": 73909,
            "sourceLinks": 8,
            "sourceLinkErrors": 0,
            "plainEndingLast": 1,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "/root/explain_visibility_b2 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/visibility-with-2.md",
          "metrics": {
            "chars": 2655,
            "words": 281,
            "durationMs": 71819,
            "sourceLinks": 9,
            "sourceLinkErrors": 0,
            "plainEndingLast": 1,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "/root/explain_visibility_b3 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/visibility-with-3.md",
          "metrics": {
            "chars": 2451,
            "words": 229,
            "durationMs": 52627,
            "sourceLinks": 9,
            "sourceLinkErrors": 0,
            "plainEndingLast": 1,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        }
      ]
    },
    {
      "date": "2026-10-02",
      "commit": "fade54b6089a35c08280609a4799d3b755f3670c",
      "model": "desktop subagents, inherited parent; exact backend identifier not exposed",
      "agent": "Codex desktop collaboration, fresh fork_turns=none; desktop build not exposed",
      "rule": "kaine-explain candidate v1, prompt-carried: flow",
      "conclusion": "effect",
      "action": "tighten",
      "trials": [
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "/root/explain_flow_a1 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/flow-without-1.md",
          "metrics": {
            "chars": 5098,
            "words": 436,
            "durationMs": 68076,
            "sourceLinks": 18,
            "sourceLinkErrors": 0,
            "plainEndingLast": 0,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "/root/explain_flow_a2 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/flow-without-2.md",
          "metrics": {
            "chars": 4440,
            "words": 422,
            "durationMs": 69161,
            "sourceLinks": 13,
            "sourceLinkErrors": 0,
            "plainEndingLast": 0,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "/root/explain_flow_a3 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/flow-without-3.md",
          "metrics": {
            "chars": 4195,
            "words": 398,
            "durationMs": 65768,
            "sourceLinks": 13,
            "sourceLinkErrors": 0,
            "plainEndingLast": 0,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "/root/explain_flow_b1 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/flow-with-1.md",
          "metrics": {
            "chars": 5742,
            "words": 560,
            "durationMs": 107456,
            "sourceLinks": 14,
            "sourceLinkErrors": 0,
            "plainEndingLast": 1,
            "diagram": 1,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "/root/explain_flow_b2 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/flow-with-2.md",
          "metrics": {
            "chars": 5412,
            "words": 520,
            "durationMs": 80627,
            "sourceLinks": 14,
            "sourceLinkErrors": 0,
            "plainEndingLast": 1,
            "diagram": 1,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "/root/explain_flow_b3 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/flow-with-3.md",
          "metrics": {
            "chars": 5060,
            "words": 511,
            "durationMs": 86395,
            "sourceLinks": 12,
            "sourceLinkErrors": 0,
            "plainEndingLast": 1,
            "diagram": 1,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        }
      ]
    },
    {
      "date": "2026-10-02",
      "commit": "fade54b6089a35c08280609a4799d3b755f3670c",
      "model": "desktop subagents, inherited parent; exact backend identifier not exposed",
      "agent": "Codex desktop collaboration, fresh fork_turns=none; desktop build not exposed",
      "rule": "kaine-explain candidate v1, prompt-carried: uncertain",
      "conclusion": "effect",
      "action": "tighten",
      "trials": [
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "/root/explain_uncertain_a1 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/uncertain-without-1.md",
          "metrics": {
            "chars": 2216,
            "words": 236,
            "durationMs": 57231,
            "sourceLinks": 7,
            "sourceLinkErrors": 0,
            "plainEndingLast": 0,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "/root/explain_uncertain_a2 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/uncertain-without-2.md",
          "metrics": {
            "chars": 2614,
            "words": 286,
            "durationMs": 51406,
            "sourceLinks": 7,
            "sourceLinkErrors": 0,
            "plainEndingLast": 0,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "/root/explain_uncertain_a3 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/uncertain-without-3.md",
          "metrics": {
            "chars": 2591,
            "words": 285,
            "durationMs": 82266,
            "sourceLinks": 7,
            "sourceLinkErrors": 0,
            "plainEndingLast": 0,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "/root/explain_uncertain_b1 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/uncertain-with-1.md",
          "metrics": {
            "chars": 2851,
            "words": 328,
            "durationMs": 71690,
            "sourceLinks": 7,
            "sourceLinkErrors": 0,
            "plainEndingLast": 1,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "/root/explain_uncertain_b2 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/uncertain-with-2.md",
          "metrics": {
            "chars": 3064,
            "words": 378,
            "durationMs": 105213,
            "sourceLinks": 7,
            "sourceLinkErrors": 0,
            "plainEndingLast": 1,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "/root/explain_uncertain_b3 · chat 01a0fd51-e8ca-7f42-af7a-054174c60d8f · .ai.local/explain-eval/2026-10-02/uncertain-with-3.md",
          "metrics": {
            "chars": 3217,
            "words": 404,
            "durationMs": 65584,
            "sourceLinks": 7,
            "sourceLinkErrors": 0,
            "plainEndingLast": 1,
            "diagram": 0,
            "uncertaintyPreserved": 1,
            "factualErrors": 0
          }
        }
      ]
    }
  ]
}
```

<!-- harness-eval:data:end -->

<!-- harness-eval:generated:start -->

4 run(s) recorded. 4 rule(s) carry an action other than keep: `verification close, prompt-carried` → tighten, `kaine-explain candidate v1, prompt-carried: visibility` → tighten, `kaine-explain candidate v1, prompt-carried: flow` → tighten, `kaine-explain candidate v1, prompt-carried: uncertain` → tighten.

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

### 2026-10-02 · `kaine-explain candidate v1, prompt-carried: visibility`

Commit `fade54b6089a35c08280609a4799d3b755f3670c` · desktop subagents, inherited parent; exact backend identifier not exposed via Codex desktop collaboration, fresh fork_turns=none; desktop build not exposed · 3 with / 3 without

**Conclusion:** effect · **Action:** tighten

Verdict mean: 5 with, 5 without (0).

| Metric               | With rule | Without rule | Delta     |
| -------------------- | --------- | ------------ | --------- |
| chars                | 2547.33   | 2055.67      | +491.67   |
| diagram              | 0         | 0            | 0         |
| durationMs           | 66118.33  | 48323.33     | +17795.00 |
| factualErrors        | 0         | 0            | 0         |
| plainEndingLast      | 1         | 0            | +1        |
| sourceLinkErrors     | 0         | 0            | 0         |
| sourceLinks          | 8.67      | 7            | +1.67     |
| uncertaintyPreserved | 1         | 1            | 0         |
| words                | 251.67    | 205          | +46.67    |

### 2026-10-02 · `kaine-explain candidate v1, prompt-carried: flow`

Commit `fade54b6089a35c08280609a4799d3b755f3670c` · desktop subagents, inherited parent; exact backend identifier not exposed via Codex desktop collaboration, fresh fork_turns=none; desktop build not exposed · 3 with / 3 without

**Conclusion:** effect · **Action:** tighten

Verdict mean: 5 with, 5 without (0).

| Metric               | With rule | Without rule | Delta     |
| -------------------- | --------- | ------------ | --------- |
| chars                | 5404.67   | 4577.67      | +827      |
| diagram              | 1         | 0            | +1        |
| durationMs           | 91492.67  | 67668.33     | +23824.33 |
| factualErrors        | 0         | 0            | 0         |
| plainEndingLast      | 1         | 0            | +1        |
| sourceLinkErrors     | 0         | 0            | 0         |
| sourceLinks          | 13.33     | 14.67        | -1.33     |
| uncertaintyPreserved | 1         | 1            | 0         |
| words                | 530.33    | 418.67       | +111.67   |

### 2026-10-02 · `kaine-explain candidate v1, prompt-carried: uncertain`

Commit `fade54b6089a35c08280609a4799d3b755f3670c` · desktop subagents, inherited parent; exact backend identifier not exposed via Codex desktop collaboration, fresh fork_turns=none; desktop build not exposed · 3 with / 3 without

**Conclusion:** effect · **Action:** tighten

Verdict mean: 5 with, 5 without (0).

| Metric               | With rule | Without rule | Delta     |
| -------------------- | --------- | ------------ | --------- |
| chars                | 3044      | 2473.67      | +570.33   |
| diagram              | 0         | 0            | 0         |
| durationMs           | 80829     | 63634.33     | +17194.67 |
| factualErrors        | 0         | 0            | 0         |
| plainEndingLast      | 1         | 0            | +1        |
| sourceLinkErrors     | 0         | 0            | 0         |
| sourceLinks          | 7         | 7            | 0         |
| uncertaintyPreserved | 1         | 1            | 0         |
| words                | 370       | 269          | +101      |

<!-- harness-eval:generated:end -->
