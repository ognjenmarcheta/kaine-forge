---
name: kaine-explain
description: Give source-grounded explanations in a useful format, and close substantive final replies with In plain language while preserving plan, review, and handoff requirements.
argument-hint: topic, path, flow, or response to clarify
---

# Explain Clearly

## Goal and activation

Help the reader understand the behavior, assess the evidence, or decide what to do.
Use this skill for substantive explanations, investigations, architecture answers,
plans, reviews, and implementation handoffs, or when explicitly invoked. Short
factual answers, progress updates, and a single clarifying question need no extra
section. Reuse unchanged instructions already loaded.

This skill shapes communication. It does not replace the owning workflow, expand
the task, or authorize publication, dependencies, or changes to application code.

## Workflow

1. Identify the reader's question or decision. Reuse the established audience and
   preferences; ask only when missing information materially changes the answer.
2. Inspect the relevant sources before describing repo behavior. Trace callers
   across package boundaries when the explanation depends on them. Use verified
   file links or source citations. Distinguish observed behavior, inference, and
   unresolved evidence; passing checks prove only what they cover.
3. Lead with the practical answer, except where an owning workflow requires a
   different order. Add a concrete example and the mechanism when they help the
   reader. Define necessary technical terms; preserve the domain names in
   `CONTEXT.md`. Use an analogy only if it clarifies the real mechanism.
4. Choose the smallest format that answers the question using the table below.
   Keep material evidence and limitations in the reply even when adding a visual.
5. Use STE-inspired prose: short sentences, active voice, one idea per sentence,
   and consistent terms. Aim for 20 words in instructions and 25 in descriptions
   when practical. Preserve accuracy and meaningful uncertainty over word limits;
   do not claim full ASD-STE100 compliance or restrict domain terms to its dictionary.
6. End every substantive final reply with **In plain language**, as described
   below. Check that this ending agrees with the evidence and adds no promises.

## Format choice

| Reader's need                                       | Format                                                      |
| --------------------------------------------------- | ----------------------------------------------------------- |
| Understand one fact or cause                        | Concise text                                                |
| Compare alternatives                                | Table                                                       |
| Trace a flow, sequence, or relationship             | Mermaid diagram; ASCII when Mermaid is unsupported          |
| Explore changing inputs or inspect connected states | Interactive HTML when interaction helps answer the question |
| Watch an explanation                                | Video only when explicitly requested and supported          |

Topic size alone does not justify HTML. Use verified behavior or clearly labeled
illustrative data. Avoid decorative controls, prescribed visual styles, and
repeating the entire explanation in several formats. Let a flow diagram carry
the sequence; use the surrounding prose for source evidence and exceptions rather
than recounting every step. Do not expand the main answer to fill an ending.

Use an available renderer and its instructions for inline HTML. Keep the visual
keyboard-accessible, readable at narrow widths, and compatible with its theme and
reduced-motion contract. Repository UI follows `DESIGN_SYSTEM.md`. When no inline
renderer is available and file creation is permitted, write self-contained HTML
under the ignored `.ai.local/explain/` directory and link to the absolute file.
When the active mode prevents file creation, use text or a diagram and state the
format limitation. Do not publish, install media tools, or add dependencies as a
side effect of explaining something. State unavailable video capability honestly.

## Workflow composition and final section

`kaine-write-plan` owns planning and the required plan wrapper.
`kaine-summarize-work` owns implementation results and verification.
`kaine-review` owns findings, severity, and the verdict; findings stay first.
Keep their required content and use this method to explain it. Include only one
plain-language ending. Put it inside a required plan wrapper and after a review
verdict or implementation verification. Nothing follows it in the final reply.

Use the exact heading **In plain language**. Lead with the practical meaning.
Explain material limitations and any necessary next action, including its owner.
Keep it proportionate: one short paragraph often suffices. Do not merely repeat
file lists, check counts, or the whole answer. Do not invent a next step or use the
ending as a reason to stop authorized work. Explain jargon respectfully.

## Verification

Check source accuracy, example behavior, format usefulness, retained uncertainty,
and the final section's placement. Inspect interactive output and exercise its
controls before claiming it works. Metadata and generation checks do not measure
reader understanding. Acceptance scenarios and reviewed sources live in
`docs/agents/skill-authoring.md` under Explanation skill acceptance.
