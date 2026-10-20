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

A rule marked `tighten` gets a candidate screen before its next run. Up to three
rewordings, each aimed at a failure a recorded trial shows, run once each on the
same task. A screen only ranks the candidates, so it never enters the data block;
the chosen wording then gets a full protocol 2 run. The skill holds this
procedure too.

## What it can and cannot tell you

It can tell you whether a rule changes output, in which direction, with a
per-trial citation you can re-read; what the compliance rate is; and, for the
verification-close rule, a hard count of checks claimed without a matching tool
call — a real hallucination rate for this harness.

It cannot give significance at `n = 3`, generalize across models, agents or task
families, detect small effects, survive a model upgrade without a re-run, or say
whether a rule helps a _human_ read the repo — which is often the real reason a
rule exists. Weigh the `action` field accordingly.

## Noise floor (protocol 2)

A run marked `"protocol": 2` names a calibration from the `calibrations` list:
an A/A run of the same agent, model and task family, with the rule present in
both arms. The difference of its two means, and never less than 0.5, is the
noise floor. `pnpm harness:eval` refuses a protocol 2 run that calls an
`effect` with `|Δ|` within the floor, or `no-effect` with `|Δ|` above it, and
any run that pairs `inconclusive` with `keep`, `delete`, or `promote-to-lint`.
Runs recorded before protocol 2 keep their original record. A rule change that
passes here is also checked against the whole harness after it merges, with
`pnpm desk stats --by-harness` (see the `kaine-harness-eval` skill).

`pnpm ai:test` runs `pnpm harness:eval --check`. It writes nothing and fails
when the generated region no longer matches the data block, so a hand edit of
the rendered tables or a data change without a render cannot merge.

## Rubric

Scored per trial, 1–5, against the paper's dimensions (task success, tool-use
quality, trajectory compliance, hallucination, response quality). A trial that
redefines its task, or quietly drops part of it, scores 1 and records
`offTask: 1`. The `action`
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

## MCP tool routing — October 20, 2026

Construction: injected-surface. Each trial is a fresh `claude -p` session with
`claude-opus-5-5` on Claude Code 2.1.291. Every trial loads only the default
servers (Context7, Playwright, Serena) through `--mcp-config` and
`--strict-mcp-config`, with the same tool allowlist. Arm B removes
`### MCP tool routing` from `.ai/guide.md` and the routing lines from the explorer
and implementer definitions, then runs `pnpm ai:install`. Probe: a sentinel line
appended to the subsection appeared in a zero-tool reply with the rule installed
(session `537a19c0`). It was absent after the strip, while the focus banner remained
(session `85308752`).

Task: list the members of the caller's active organization with better-auth's
organization plugin, 20 per page, for the repo's version. The installed 1.7.10
`crud-members.mjs` is the ground truth. All 12 answers give
`auth.api.listMembers({ headers, query: { limit, offset } })`, return
`{ members, total }`, and leave out a client organization id, so all score 5.
Δ is 0, and the calibration floor is 0.5.

The rule changes the process, not the answer:

- **Version source:** 9 of 9 rule-present trials read the `pnpm-workspace.yaml`
  catalog first; 0 of 3 stripped trials did.
- **Context7:** called in 2 of 9 rule-present trials and 0 of 3 stripped trials.
  Both calls found that Context7's newest better-auth snapshot is v1.6.23, older
  than the catalog's 1.7.10, and both trials used the installed source instead.
- **Installed source:** every trial read the installed package source.

Action: tighten. The Context7 clause sent agents to a source that lags the
installed version. The guide now says to read the installed package's types or
source first, and to use Context7 for packages that are not installed or for
guides, after checking its snapshot version. The new wording is not measured yet.
It needs a candidate screen and a second protocol 2 run before `keep` or `delete`.
No trial exercised the Playwright clause.

Cost: the 12 trials cost $0.29 to $0.44 each, $4.51 in total. An earlier probe
without `--strict-mcp-config` loaded every user-level MCP server and wrote 406,552
prompt-cache tokens ($3.27) for one zero-tool turn. With only the repo servers,
the base context is about 22,000 tokens. Pass `--strict-mcp-config` for headless
trials.

`n = 3` per arm detects only large effects. The result covers one model, one CLI
version and one task family. Transcripts, prompts and scripts are local ignored
evidence under `.ai.local/harness-eval/2026-10-20/`.

### Second run: v2 wording

The second run measures the v2 wording, which puts the installed package before
Context7. It uses the same task, rubric, construction and calibration as the
first run, with six new fresh sessions. There was no candidate screen, because
only one candidate wording existed. The probe sentinel appeared with the rule
(session `01e6708f`) and was absent after the strip (sessions `b838941c` and
`63c952f2`). Neither stripped probe printed the banner. Both answered from the
`AGENTS.md` naming rule with zero tools, which proves injection. The stripped
guide still contains the banner rule, so the missing banner is compliance noise.

The verdict means are 5 with the rule and 4.67 without it, so Δ is +0.33. That is
within the 0.5 floor, so the conclusion is `no-effect`. Trial `r2-without-1` scores
4:

- It searched the main checkout's path and then said that the worktree has no
  `node_modules`, which is false.
- After its WebFetch call was denied, it answered from an unversioned Context7
  snapshot and from memory.
- Its call is correct, but its parameters were not verified against 1.7.10.

The process difference repeats the first run. Across both runs, 12 of 12
rule-present trials read the catalog first, against 0 of 6 stripped trials. In
this run, rule-present trials used a mean of 6 tool calls and 36.7 cents. Stripped
trials used 11.7 calls and 47.3 cents. No rule-present trial called Context7.

Action: tighten, with no new rewording. This is the first measurement of the v2
wording, so one no-op cannot justify deletion. No trial shows a v2 wording failure
to target. The verdict sits near its ceiling because the installed source is easy
to find, so this task family cannot show a quality gain. The next run needs a task
where model memory and the installed version disagree, and a rubric that scores
tool-use quality as well as the answer. Run it before `keep` or `delete`.

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
    },
    {
      "date": "2026-10-20",
      "commit": "18d416b + uncommitted MCP tooling patch sha256 d474e7c161d93b1d",
      "model": "claude-opus-5-5",
      "agent": "claude -p main session (Claude Code 2.1.291), MCP context7/playwright/serena via --strict-mcp-config",
      "rule": "MCP tool routing subsection (Context7 clause), injected-surface",
      "conclusion": "no-effect",
      "action": "tighten",
      "protocol": 2,
      "calibration": "version-lookup-2026-10-20",
      "trials": [
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "session b6daee32-d9b6-489c-92ac-db93d5204b4c · .ai.local/harness-eval/2026-10-20/trial-with-1.jsonl",
          "metrics": {
            "context7Calls": 0,
            "catalogFirst": 1,
            "catalogRead": 1,
            "installedSourceRead": 1,
            "toolUses": 9,
            "focusBanner": 1,
            "costCents": 44
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "session 9fcb2b16-8d8c-4f53-ae02-151b841f12b2 · .ai.local/harness-eval/2026-10-20/trial-with-2.jsonl",
          "metrics": {
            "context7Calls": 0,
            "catalogFirst": 1,
            "catalogRead": 1,
            "installedSourceRead": 1,
            "toolUses": 6,
            "focusBanner": 1,
            "costCents": 42
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "session 3e3051c3-8d5f-4f1c-bcc3-5d98e25f33fc · .ai.local/harness-eval/2026-10-20/trial-with-3.jsonl",
          "metrics": {
            "context7Calls": 0,
            "catalogFirst": 1,
            "catalogRead": 1,
            "installedSourceRead": 1,
            "toolUses": 6,
            "focusBanner": 1,
            "costCents": 40
          }
        },
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "session d7be0cf2-a2fd-4ca8-84b9-d1de40201c4b · .ai.local/harness-eval/2026-10-20/trial-without-1.jsonl",
          "metrics": {
            "context7Calls": 0,
            "catalogFirst": 0,
            "catalogRead": 1,
            "installedSourceRead": 1,
            "toolUses": 9,
            "focusBanner": 0,
            "costCents": 43
          }
        },
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "session 7da0146d-9589-4955-86af-60ec77e5ba6a · .ai.local/harness-eval/2026-10-20/trial-without-2.jsonl",
          "metrics": {
            "context7Calls": 0,
            "catalogFirst": 0,
            "catalogRead": 1,
            "installedSourceRead": 1,
            "toolUses": 9,
            "focusBanner": 1,
            "costCents": 40
          }
        },
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "session 10995fb8-7bff-4f28-9a98-23db2fc051ce · .ai.local/harness-eval/2026-10-20/trial-without-3.jsonl",
          "metrics": {
            "context7Calls": 0,
            "catalogFirst": 0,
            "catalogRead": 0,
            "installedSourceRead": 1,
            "toolUses": 9,
            "focusBanner": 1,
            "costCents": 42
          }
        }
      ]
    },
    {
      "date": "2026-10-20",
      "commit": "18d416b + uncommitted MCP tooling patch sha256 a1f61bb3db76baaa",
      "model": "claude-opus-5-5",
      "agent": "claude -p main session (Claude Code 2.1.291), MCP context7/playwright/serena via --strict-mcp-config",
      "rule": "MCP tool routing subsection v2 (installed package first), injected-surface",
      "conclusion": "no-effect",
      "action": "tighten",
      "protocol": 2,
      "calibration": "version-lookup-2026-10-20",
      "trials": [
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "session 8b5d4e03-6bc9-4bed-8bc6-f8fdc95b261e · .ai.local/harness-eval/2026-10-20/trial-r2-with-1.jsonl",
          "metrics": {
            "context7Calls": 0,
            "catalogFirst": 1,
            "catalogRead": 1,
            "installedSourceRead": 1,
            "toolUses": 7,
            "focusBanner": 1,
            "costCents": 39,
            "falseClaims": 0
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "session 7dd9359a-86a9-4819-8363-91813ce23bc8 · .ai.local/harness-eval/2026-10-20/trial-r2-with-2.jsonl",
          "metrics": {
            "context7Calls": 0,
            "catalogFirst": 1,
            "catalogRead": 1,
            "installedSourceRead": 1,
            "toolUses": 6,
            "focusBanner": 1,
            "costCents": 36,
            "falseClaims": 0
          }
        },
        {
          "arm": "with",
          "verdict": 5,
          "transcript": "session 47cbd687-f0bc-40ae-92a3-f2e0cfac7be9 · .ai.local/harness-eval/2026-10-20/trial-r2-with-3.jsonl",
          "metrics": {
            "context7Calls": 0,
            "catalogFirst": 1,
            "catalogRead": 1,
            "installedSourceRead": 1,
            "toolUses": 5,
            "focusBanner": 1,
            "costCents": 35,
            "falseClaims": 0
          }
        },
        {
          "arm": "without",
          "verdict": 4,
          "transcript": "session 20ddfeb5-ebf6-44b8-b2ed-11e33c8ff007 · .ai.local/harness-eval/2026-10-20/trial-r2-without-1.jsonl",
          "metrics": {
            "context7Calls": 3,
            "catalogFirst": 0,
            "catalogRead": 1,
            "installedSourceRead": 1,
            "toolUses": 15,
            "focusBanner": 1,
            "costCents": 54,
            "falseClaims": 1
          }
        },
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "session 3f9180f3-a963-46d6-beaa-ac98a69f2c29 · .ai.local/harness-eval/2026-10-20/trial-r2-without-2.jsonl",
          "metrics": {
            "context7Calls": 0,
            "catalogFirst": 0,
            "catalogRead": 1,
            "installedSourceRead": 1,
            "toolUses": 13,
            "focusBanner": 1,
            "costCents": 51,
            "falseClaims": 0
          }
        },
        {
          "arm": "without",
          "verdict": 5,
          "transcript": "session 8adff4a4-f913-4d5c-860a-ef7a7ff07ab0 · .ai.local/harness-eval/2026-10-20/trial-r2-without-3.jsonl",
          "metrics": {
            "context7Calls": 0,
            "catalogFirst": 0,
            "catalogRead": 1,
            "installedSourceRead": 1,
            "toolUses": 7,
            "focusBanner": 1,
            "costCents": 37,
            "falseClaims": 0
          }
        }
      ]
    }
  ],
  "calibrations": [
    {
      "id": "version-lookup-2026-10-20",
      "date": "2026-10-20",
      "model": "claude-opus-5-5",
      "agent": "claude -p main session (Claude Code 2.1.291), MCP context7/playwright/serena via --strict-mcp-config",
      "taskFamily": "version-sensitive third-party API lookup (better-auth 1.7.10 listMembers)",
      "trials": [
        {
          "arm": "first",
          "verdict": 5,
          "transcript": "session 8e888ecf-adc2-4cb2-8c54-746779991947 · .ai.local/harness-eval/2026-10-20/trial-calA-1.jsonl"
        },
        {
          "arm": "first",
          "verdict": 5,
          "transcript": "session df0d2083-7141-4950-9569-f6670e3c6fa3 · .ai.local/harness-eval/2026-10-20/trial-calA-2.jsonl"
        },
        {
          "arm": "first",
          "verdict": 5,
          "transcript": "session 6fe76748-c80a-4338-b99e-4f5d70064e8e · .ai.local/harness-eval/2026-10-20/trial-calA-3.jsonl"
        },
        {
          "arm": "second",
          "verdict": 5,
          "transcript": "session 239f5172-1837-443b-b02a-7fd353e905c2 · .ai.local/harness-eval/2026-10-20/trial-calB-1.jsonl"
        },
        {
          "arm": "second",
          "verdict": 5,
          "transcript": "session 6bc25a9d-327c-497f-bafd-9e1e1e599490 · .ai.local/harness-eval/2026-10-20/trial-calB-2.jsonl"
        },
        {
          "arm": "second",
          "verdict": 5,
          "transcript": "session 8ef13320-aacb-49c1-9228-822bab5ff289 · .ai.local/harness-eval/2026-10-20/trial-calB-3.jsonl"
        }
      ]
    }
  ]
}
```

<!-- harness-eval:data:end -->

<!-- harness-eval:generated:start -->

6 run(s) recorded. 6 rule(s) carry an action other than keep: `verification close, prompt-carried` → tighten, `kaine-explain candidate v1, prompt-carried: visibility` → tighten, `kaine-explain candidate v1, prompt-carried: flow` → tighten, `kaine-explain candidate v1, prompt-carried: uncertain` → tighten, `MCP tool routing subsection (Context7 clause), injected-surface` → tighten, `MCP tool routing subsection v2 (installed package first), injected-surface` → tighten.

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

### 2026-10-20 · `MCP tool routing subsection (Context7 clause), injected-surface`

Commit `18d416b + uncommitted MCP tooling patch sha256 d474e7c161d93b1d` · claude-opus-5-5 via claude -p main session (Claude Code 2.1.291), MCP context7/playwright/serena via --strict-mcp-config · 3 with / 3 without

**Conclusion:** no-effect · **Action:** tighten

Verdict mean: 5 with, 5 without (0).

Noise floor 0.50 from calibration `version-lookup-2026-10-20`: |Δ| 0 is within it.

| Metric              | With rule | Without rule | Delta |
| ------------------- | --------- | ------------ | ----- |
| catalogFirst        | 1         | 0            | +1    |
| catalogRead         | 1         | 0.67         | +0.33 |
| context7Calls       | 0         | 0            | 0     |
| costCents           | 42        | 41.67        | +0.33 |
| focusBanner         | 1         | 0.67         | +0.33 |
| installedSourceRead | 1         | 1            | 0     |
| toolUses            | 7         | 9            | -2    |

### 2026-10-20 · `MCP tool routing subsection v2 (installed package first), injected-surface`

Commit `18d416b + uncommitted MCP tooling patch sha256 a1f61bb3db76baaa` · claude-opus-5-5 via claude -p main session (Claude Code 2.1.291), MCP context7/playwright/serena via --strict-mcp-config · 3 with / 3 without

**Conclusion:** no-effect · **Action:** tighten

Verdict mean: 5 with, 4.67 without (+0.33).

Noise floor 0.50 from calibration `version-lookup-2026-10-20`: |Δ| 0.33 is within it.

| Metric              | With rule | Without rule | Delta  |
| ------------------- | --------- | ------------ | ------ |
| catalogFirst        | 1         | 0            | +1     |
| catalogRead         | 1         | 1            | 0      |
| context7Calls       | 0         | 1            | -1     |
| costCents           | 36.67     | 47.33        | -10.67 |
| falseClaims         | 0         | 0.33         | -0.33  |
| focusBanner         | 1         | 1            | 0      |
| installedSourceRead | 1         | 1            | 0      |
| toolUses            | 6         | 11.67        | -5.67  |

### Calibrations

| Id                          | Date       | Model via agent                                                                                                          | Task family                                                               | Trials | Noise floor |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------ | ----------- |
| `version-lookup-2026-10-20` | 2026-10-20 | claude-opus-5-5 via claude -p main session (Claude Code 2.1.291), MCP context7/playwright/serena via --strict-mcp-config | version-sensitive third-party API lookup (better-auth 1.7.10 listMembers) | 6      | 0.50        |

<!-- harness-eval:generated:end -->
